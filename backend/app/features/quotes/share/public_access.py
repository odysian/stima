"""Public-access helpers for the quote share slice."""

from __future__ import annotations

import asyncio
import base64
import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Literal, Protocol

from app.features.quotes.errors import QuoteServiceError
from app.features.quotes.models import QuoteStatus
from app.features.quotes.repository import (
    PublicShareRecord,
    QuoteRenderContext,
    QuoteViewTransition,
)
from app.features.quotes.share.tokens import _share_token_has_expired
from app.integrations.storage import StorageNotFoundError, StorageServiceProtocol
from app.shared.image_signatures import detect_image_content_type
from app.shared.observability import current_request_context, hash_token_reference

if TYPE_CHECKING:
    from app.features.quotes.share.service import QuoteShareRepositoryProtocol


class _LogPublicShareDenied(Protocol):
    def __call__(
        self,
        share_record: PublicShareRecord,
        *,
        share_token: str,
        reason_code: Literal["revoked", "expired"],
    ) -> None: ...


def _utcnow() -> datetime:
    return datetime.now(UTC)


async def _attach_logo_data_uri(
    context: QuoteRenderContext,
    *,
    storage_service: StorageServiceProtocol,
    logger: logging.Logger,
    document_label: str,
) -> None:
    if context.logo_path is None:
        context.logo_data_uri = None
        return

    try:
        logo_bytes = await asyncio.to_thread(
            storage_service.fetch_bytes,
            context.logo_path,
        )
    except StorageNotFoundError:
        logger.warning("%s logo missing in storage; omitting from PDF render", document_label)
        context.logo_data_uri = None
        return
    except Exception:  # noqa: BLE001
        logger.warning(
            "Failed to load %s logo for PDF render; omitting logo",
            document_label.lower(),
            exc_info=True,
        )
        context.logo_data_uri = None
        return

    content_type = detect_image_content_type(logo_bytes)
    if content_type is None:
        logger.warning("%s logo bytes were invalid; omitting from PDF render", document_label)
        context.logo_data_uri = None
        return

    encoded_logo = base64.b64encode(logo_bytes).decode("ascii")
    context.logo_data_uri = f"data:{content_type};base64,{encoded_logo}"


async def _get_public_quote_context(
    *,
    repository: QuoteShareRepositoryProtocol,
    share_token: str,
    log_public_share_denied: _LogPublicShareDenied,
) -> QuoteRenderContext:
    """Load public quote context for a share token or raise a 404."""
    now = _utcnow()
    share_record = await repository.get_public_share_record(share_token)
    if share_record is None:
        raise QuoteServiceError(detail="Not found", status_code=404)
    if share_record.share_token_revoked_at is not None:
        log_public_share_denied(
            share_record,
            share_token=share_token,
            reason_code="revoked",
        )
        raise QuoteServiceError(detail="Not found", status_code=404)
    if _share_token_has_expired(share_record.share_token_expires_at, now):
        log_public_share_denied(
            share_record,
            share_token=share_token,
            reason_code="expired",
        )
        raise QuoteServiceError(detail="Not found", status_code=404)

    context = await repository.get_render_context_by_share_token(share_token)
    if context is None:
        raise QuoteServiceError(detail="Not found", status_code=404)
    return context


async def _mark_public_quote_viewed_once(
    *,
    repository: QuoteShareRepositoryProtocol,
    context: QuoteRenderContext,
    share_token: str,
    log_public_quote_viewed: Callable[[QuoteViewTransition], None],
) -> None:
    """Advance shared quotes to viewed once; otherwise touch access timestamp."""
    accessed_at = _utcnow()
    if context.status != QuoteStatus.SHARED.value:
        await repository.touch_last_public_accessed_at_by_share_token(
            share_token,
            accessed_at=accessed_at,
        )
        await repository.commit()
        return

    transition = await repository.transition_to_viewed_by_share_token(
        share_token,
        accessed_at=accessed_at,
    )
    if transition is not None:
        await repository.commit()
        log_public_quote_viewed(transition)
        context.status = QuoteStatus.VIEWED.value
        return

    await repository.touch_last_public_accessed_at_by_share_token(
        share_token,
        accessed_at=accessed_at,
    )
    await repository.commit()
    refreshed_context = await repository.get_render_context_by_share_token(share_token)
    if refreshed_context is not None:
        context.status = refreshed_context.status


def _build_public_share_denial_rate_limit_key(
    *,
    document_type: str,
    reason_code: str,
    share_token: str,
) -> str:
    request_context = current_request_context()
    source = (
        request_context.client_ip_hash
        if request_context is not None
        else hash_token_reference(share_token)
    )
    return f"public-share:{document_type}:{reason_code}:{source}"
