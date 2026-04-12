"""Quote share lifecycle service for owner and public access behavior."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Literal, Protocol
from uuid import UUID, uuid4

from app.features.quotes.errors import QuoteServiceError
from app.features.quotes.models import Document, QuoteStatus
from app.features.quotes.repository import (
    PublicShareRecord,
    QuoteRenderContext,
    QuoteViewTransition,
)
from app.features.quotes.share.public_access import (
    _attach_logo_data_uri,
    _build_public_share_denial_rate_limit_key,
    _get_public_quote_context,
    _mark_public_quote_viewed_once,
)
from app.features.quotes.share.tokens import (
    _build_share_token_expiry,
    _share_token_has_expired,
)
from app.integrations.pdf import PdfRenderError
from app.integrations.storage import StorageNotFoundError, StorageServiceProtocol
from app.shared.event_logger import log_event
from app.shared.image_signatures import detect_image_content_type
from app.shared.observability import log_security_event

LOGGER = logging.getLogger(__name__)

_POST_SHARE_NON_REGRESSION_STATUSES = frozenset(
    {
        QuoteStatus.VIEWED,
        QuoteStatus.APPROVED,
        QuoteStatus.DECLINED,
    }
)


class QuoteShareRepositoryProtocol(Protocol):
    """Repository behavior required by the quote share slice."""

    async def get_by_id(self, quote_id: UUID, user_id: UUID) -> Document | None: ...

    async def get_public_share_record(self, share_token: str) -> PublicShareRecord | None: ...

    async def get_render_context_by_share_token(
        self, share_token: str
    ) -> QuoteRenderContext | None: ...

    async def transition_to_viewed_by_share_token(
        self,
        share_token: str,
        *,
        accessed_at: datetime,
    ) -> QuoteViewTransition | None: ...

    async def touch_last_public_accessed_at_by_share_token(
        self,
        share_token: str,
        *,
        accessed_at: datetime,
    ) -> None: ...

    async def commit(self) -> None: ...

    async def refresh(self, document: Document) -> Document: ...


class QuoteSharePdfIntegrationProtocol(Protocol):
    """PDF rendering dependency required for public quote share access."""

    def render(self, context: QuoteRenderContext) -> bytes: ...


class QuoteShareService:
    """Own owner-facing and public quote share lifecycle behavior."""

    def __init__(
        self,
        *,
        repository: QuoteShareRepositoryProtocol,
        pdf_integration: QuoteSharePdfIntegrationProtocol,
        storage_service: StorageServiceProtocol,
        ensure_quote_customer_assigned: Callable[[Document], None],
    ) -> None:
        self._repository = repository
        self._pdf = pdf_integration
        self._storage_service = storage_service
        self._ensure_quote_customer_assigned = ensure_quote_customer_assigned

    async def share_quote(
        self,
        *,
        user_id: UUID,
        quote_id: UUID,
        regenerate: bool = False,
    ) -> Document:
        """Set share token/timestamp and transition quote status to shared."""
        quote = await self._repository.get_by_id(quote_id, user_id)
        if quote is None:
            raise QuoteServiceError(detail="Not found", status_code=404)

        self._ensure_quote_customer_assigned(quote)
        now = _utcnow()
        should_refresh_token = (
            regenerate
            or quote.share_token is None
            or quote.share_token_revoked_at is not None
            or _share_token_has_expired(quote.share_token_expires_at, now)
        )
        if quote.status in _POST_SHARE_NON_REGRESSION_STATUSES and not should_refresh_token:
            return quote

        if should_refresh_token:
            quote.share_token = str(uuid4())
            quote.share_token_created_at = now
            quote.share_token_expires_at = _build_share_token_expiry(now)
            quote.share_token_revoked_at = None

        if quote.status not in _POST_SHARE_NON_REGRESSION_STATUSES:
            quote.shared_at = now
            quote.status = QuoteStatus.SHARED
        elif quote.shared_at is None:
            quote.shared_at = now

        await self._repository.commit()
        refreshed_quote = await self._repository.refresh(quote)
        log_event(
            "quote_shared",
            user_id=user_id,
            quote_id=refreshed_quote.id,
            customer_id=refreshed_quote.customer_id,
        )
        return refreshed_quote

    async def revoke_public_share(self, *, user_id: UUID, quote_id: UUID) -> None:
        """Revoke the currently active public share token for one quote."""
        quote = await self._repository.get_by_id(quote_id, user_id)
        if quote is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        if quote.share_token is None or quote.share_token_revoked_at is not None:
            return

        quote.share_token_revoked_at = _utcnow()
        await self._repository.commit()

    async def generate_shared_pdf(self, share_token: str) -> tuple[str, bytes]:
        """Render and return a publicly shared quote PDF by token."""
        context = await _get_public_quote_context(
            repository=self._repository,
            share_token=share_token,
            log_public_share_denied=self._log_public_share_denied,
        )
        await _attach_logo_data_uri(
            context,
            storage_service=self._storage_service,
            logger=LOGGER,
            document_label="Quote",
        )

        try:
            pdf_bytes = await asyncio.to_thread(self._pdf.render, context)
        except PdfRenderError as exc:
            raise QuoteServiceError(detail=str(exc), status_code=422) from exc

        await _mark_public_quote_viewed_once(
            repository=self._repository,
            context=context,
            share_token=share_token,
            log_public_quote_viewed=self._log_public_quote_viewed,
        )
        return context.doc_number, pdf_bytes

    async def get_public_quote(self, share_token: str) -> QuoteRenderContext:
        """Return public quote data and apply the first shared->viewed transition once."""
        context = await _get_public_quote_context(
            repository=self._repository,
            share_token=share_token,
            log_public_share_denied=self._log_public_share_denied,
        )
        await _mark_public_quote_viewed_once(
            repository=self._repository,
            context=context,
            share_token=share_token,
            log_public_quote_viewed=self._log_public_quote_viewed,
        )
        return context

    async def get_public_logo(self, share_token: str) -> tuple[bytes, str]:
        """Return public logo bytes/content type for one shared quote token."""
        context = await _get_public_quote_context(
            repository=self._repository,
            share_token=share_token,
            log_public_share_denied=self._log_public_share_denied,
        )
        if context.logo_path is None:
            raise QuoteServiceError(detail="Logo not found", status_code=404)

        try:
            logo_bytes = await asyncio.to_thread(
                self._storage_service.fetch_bytes,
                context.logo_path,
            )
        except StorageNotFoundError as exc:
            raise QuoteServiceError(detail="Logo not found", status_code=404) from exc
        except Exception as exc:  # noqa: BLE001
            raise QuoteServiceError(detail="Unable to load logo", status_code=500) from exc

        content_type = detect_image_content_type(logo_bytes)
        if content_type is None:
            raise QuoteServiceError(detail="Unable to load logo", status_code=500)

        return logo_bytes, content_type

    def _log_public_quote_viewed(self, transition: QuoteViewTransition) -> None:
        log_event(
            "quote_viewed",
            user_id=transition.user_id,
            quote_id=transition.quote_id,
            customer_id=transition.customer_id,
        )

    def _log_public_share_denied(
        self,
        share_record: PublicShareRecord,
        *,
        share_token: str,
        reason_code: Literal["revoked", "expired"],
    ) -> None:
        """Record the internal reason when a quote token is denied publicly."""
        log_security_event(
            "public_share.token_denied",
            outcome="denied",
            level=logging.WARNING,
            status_code=404,
            reason=reason_code,
            token_ref=share_token,
            rate_limit_key=_build_public_share_denial_rate_limit_key(
                document_type="quote",
                reason_code=reason_code,
                share_token=share_token,
            ),
            rate_limit_seconds=60,
            document_id=str(share_record.document_id),
            document_type="quote",
        )


def _utcnow() -> datetime:
    return datetime.now(UTC)
