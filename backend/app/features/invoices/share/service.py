"""Invoice share lifecycle service for owner and public access behavior."""

from __future__ import annotations

import asyncio
import base64
import logging
from datetime import UTC, datetime, timedelta
from typing import Literal, Protocol
from uuid import UUID, uuid4

from app.core.config import get_settings
from app.features.invoices.repository import InvoiceFirstViewTransition, InvoicePublicShareRecord
from app.features.quotes.models import Document, QuoteStatus
from app.features.quotes.repository import QuoteRenderContext
from app.features.quotes.service import QuoteServiceError
from app.integrations.pdf import PdfRenderError
from app.integrations.storage import StorageNotFoundError, StorageServiceProtocol
from app.shared.event_logger import log_event
from app.shared.image_signatures import detect_image_content_type
from app.shared.observability import (
    current_request_context,
    hash_token_reference,
    log_security_event,
)

LOGGER = logging.getLogger(__name__)

_OUTCOME_SHARE_NON_REGRESSION_STATUSES = frozenset(
    {
        QuoteStatus.SENT,
        QuoteStatus.PAID,
        QuoteStatus.VOID,
    }
)


class InvoiceShareRepositoryProtocol(Protocol):
    """Repository behavior required by the invoice share slice."""

    async def get_by_id(self, invoice_id: UUID, user_id: UUID) -> Document | None: ...

    async def get_public_share_record(
        self,
        share_token: str,
    ) -> InvoicePublicShareRecord | None: ...

    async def get_render_context_by_share_token(
        self,
        share_token: str,
    ) -> QuoteRenderContext | None: ...

    async def mark_first_public_view_by_share_token(
        self,
        share_token: str,
        *,
        viewed_at: datetime,
    ) -> InvoiceFirstViewTransition | None: ...

    async def touch_last_public_accessed_at_by_share_token(
        self,
        share_token: str,
        *,
        accessed_at: datetime,
    ) -> None: ...

    async def commit(self) -> None: ...

    async def refresh(self, invoice: Document) -> Document: ...


class InvoiceSharePdfIntegrationProtocol(Protocol):
    """PDF rendering dependency required for public invoice share access."""

    def render(self, context: QuoteRenderContext) -> bytes: ...


class InvoiceShareService:
    """Own owner-facing and public invoice share lifecycle behavior."""

    def __init__(
        self,
        *,
        repository: InvoiceShareRepositoryProtocol,
        pdf_integration: InvoiceSharePdfIntegrationProtocol,
        storage_service: StorageServiceProtocol,
    ) -> None:
        self._repository = repository
        self._pdf = pdf_integration
        self._storage_service = storage_service

    async def share_invoice(
        self,
        *,
        user_id: UUID,
        invoice_id: UUID,
        regenerate: bool = False,
    ) -> Document:
        """Create/reuse an invoice share token without regressing paid/void labels."""
        invoice = await self._repository.get_by_id(invoice_id, user_id)
        if invoice is None:
            raise QuoteServiceError(detail="Not found", status_code=404)

        now = _utcnow()
        should_refresh_token = (
            regenerate
            or invoice.share_token is None
            or invoice.share_token_revoked_at is not None
            or _share_token_has_expired(invoice.share_token_expires_at, now)
        )
        if invoice.status in _OUTCOME_SHARE_NON_REGRESSION_STATUSES and not should_refresh_token:
            return invoice

        if should_refresh_token:
            invoice.share_token = str(uuid4())
            invoice.share_token_created_at = now
            invoice.share_token_expires_at = _build_share_token_expiry(now)
            invoice.share_token_revoked_at = None
            log_event(
                "invoice_shared",
                user_id=user_id,
                invoice_id=invoice.id,
                customer_id=invoice.customer_id,
            )

        if invoice.status not in _OUTCOME_SHARE_NON_REGRESSION_STATUSES:
            invoice.shared_at = now
            invoice.status = QuoteStatus.SENT
        elif invoice.shared_at is None:
            invoice.shared_at = now

        await self._repository.commit()
        return await self._repository.refresh(invoice)

    async def revoke_public_share(self, *, user_id: UUID, invoice_id: UUID) -> None:
        """Revoke the currently active public share token for one invoice."""
        invoice = await self._repository.get_by_id(invoice_id, user_id)
        if invoice is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        if invoice.share_token is None or invoice.share_token_revoked_at is not None:
            return

        invoice.share_token_revoked_at = _utcnow()
        await self._repository.commit()

    async def generate_shared_pdf(self, share_token: str) -> tuple[str, bytes]:
        """Render and return one shared invoice PDF by share token."""
        context = await self._get_public_invoice_context(share_token)
        await self._attach_logo_data_uri(context)

        try:
            pdf_bytes = await asyncio.to_thread(self._pdf.render, context)
        except PdfRenderError as exc:
            raise QuoteServiceError(detail=str(exc), status_code=422) from exc

        await self._repository.touch_last_public_accessed_at_by_share_token(
            share_token,
            accessed_at=_utcnow(),
        )
        await self._repository.commit()
        return context.doc_number, pdf_bytes

    async def get_public_invoice(self, share_token: str) -> QuoteRenderContext:
        """Return public invoice data and emit the first-view event exactly once."""
        context = await self._get_public_invoice_context(share_token)
        viewed_at = _utcnow()
        first_view_transition = await self._repository.mark_first_public_view_by_share_token(
            share_token,
            viewed_at=viewed_at,
        )
        if first_view_transition is None:
            await self._repository.touch_last_public_accessed_at_by_share_token(
                share_token,
                accessed_at=viewed_at,
            )
        await self._repository.commit()

        if first_view_transition is not None:
            log_event(
                "invoice_viewed",
                user_id=first_view_transition.user_id,
                invoice_id=first_view_transition.invoice_id,
                customer_id=first_view_transition.customer_id,
            )

        return context

    async def get_public_logo(self, share_token: str) -> tuple[bytes, str]:
        """Return public logo bytes/content type for one shared invoice token."""
        context = await self._get_public_invoice_context(share_token)
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

    async def _get_public_invoice_context(self, share_token: str) -> QuoteRenderContext:
        """Load public invoice context for a share token or raise a 404."""
        now = _utcnow()
        share_record = await self._repository.get_public_share_record(share_token)
        if share_record is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        if share_record.share_token_revoked_at is not None:
            self._log_public_share_denied(
                share_record,
                share_token=share_token,
                reason_code="revoked",
            )
            raise QuoteServiceError(detail="Not found", status_code=404)
        if _share_token_has_expired(share_record.share_token_expires_at, now):
            self._log_public_share_denied(
                share_record,
                share_token=share_token,
                reason_code="expired",
            )
            raise QuoteServiceError(detail="Not found", status_code=404)

        context = await self._repository.get_render_context_by_share_token(share_token)
        if context is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        return context

    def _log_public_share_denied(
        self,
        share_record: InvoicePublicShareRecord,
        *,
        share_token: str,
        reason_code: Literal["revoked", "expired"],
    ) -> None:
        """Record the internal reason when an invoice token is denied publicly."""
        log_security_event(
            "public_share.token_denied",
            outcome="denied",
            level=logging.WARNING,
            status_code=404,
            reason=reason_code,
            token_ref=share_token,
            rate_limit_key=_build_public_share_denial_rate_limit_key(
                document_type="invoice",
                reason_code=reason_code,
                share_token=share_token,
            ),
            rate_limit_seconds=60,
            document_id=str(share_record.invoice_id),
            document_type="invoice",
        )

    async def _attach_logo_data_uri(self, context: QuoteRenderContext) -> None:
        if context.logo_path is None:
            context.logo_data_uri = None
            return

        try:
            logo_bytes = await asyncio.to_thread(
                self._storage_service.fetch_bytes,
                context.logo_path,
            )
        except StorageNotFoundError:
            LOGGER.warning("Invoice logo missing in storage; omitting from PDF render")
            context.logo_data_uri = None
            return
        except Exception:  # noqa: BLE001
            LOGGER.warning(
                "Failed to load invoice logo for PDF render; omitting logo",
                exc_info=True,
            )
            context.logo_data_uri = None
            return

        content_type = detect_image_content_type(logo_bytes)
        if content_type is None:
            LOGGER.warning("Invoice logo bytes were invalid; omitting from PDF render")
            context.logo_data_uri = None
            return

        encoded_logo = base64.b64encode(logo_bytes).decode("ascii")
        context.logo_data_uri = f"data:{content_type};base64,{encoded_logo}"


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _build_share_token_expiry(created_at: datetime) -> datetime:
    return created_at + timedelta(days=get_settings().public_share_link_expire_days)


def _share_token_has_expired(expires_at: datetime | None, now: datetime) -> bool:
    return expires_at is not None and expires_at < now


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
