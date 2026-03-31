"""Invoice service orchestration."""

from __future__ import annotations

import asyncio
import base64
import logging
from datetime import UTC, date, datetime
from typing import Protocol, cast
from uuid import UUID, uuid4

from sqlalchemy import inspect as sa_inspect
from sqlalchemy.exc import IntegrityError

from app.features.auth.models import User
from app.features.invoices.repository import (
    InvoiceDetailRow,
    InvoiceRepository,
    build_default_due_date,
)
from app.features.invoices.schemas import InvoiceCreateRequest
from app.features.quotes.models import Document, QuoteStatus
from app.features.quotes.repository import QuoteRenderContext
from app.features.quotes.schemas import LineItemDraft
from app.features.quotes.service import QuoteRepositoryProtocol, QuoteServiceError
from app.integrations.pdf import PdfRenderError
from app.integrations.storage import StorageNotFoundError, StorageReaderProtocol
from app.shared.event_logger import log_event
from app.shared.image_signatures import detect_image_content_type

LOGGER = logging.getLogger(__name__)
_EDITABLE_INVOICE_STATUSES = frozenset({QuoteStatus.DRAFT, QuoteStatus.READY, QuoteStatus.SENT})


class InvoiceRepositoryProtocol(Protocol):
    """Structural protocol for invoice repository dependencies."""

    async def customer_exists_for_user(self, *, user_id: UUID, customer_id: UUID) -> bool: ...

    async def get_by_id(self, invoice_id: UUID, user_id: UUID) -> Document | None: ...

    async def get_by_source_document_id(
        self,
        *,
        source_document_id: UUID,
        user_id: UUID,
    ) -> Document | None: ...

    async def get_detail_by_id(
        self,
        invoice_id: UUID,
        user_id: UUID,
    ) -> InvoiceDetailRow | None: ...

    async def get_render_context(
        self,
        invoice_id: UUID,
        user_id: UUID,
    ) -> QuoteRenderContext | None: ...

    async def get_render_context_by_share_token(
        self,
        share_token: str,
    ) -> QuoteRenderContext | None: ...

    async def create_from_quote(
        self,
        *,
        source_quote: Document,
        due_date: date,
    ) -> Document: ...

    async def create(
        self,
        *,
        user_id: UUID,
        customer_id: UUID,
        title: str | None,
        transcript: str,
        line_items: list[LineItemDraft],
        total_amount: float | None,
        notes: str | None,
        source_type: str,
        due_date: date,
    ) -> Document: ...

    async def update_due_date(self, *, invoice: Document, due_date: date) -> Document: ...

    async def mark_ready_if_draft(self, *, invoice_id: UUID, user_id: UUID) -> None: ...

    async def commit(self) -> None: ...

    async def refresh(self, invoice: Document) -> Document: ...

    async def rollback(self) -> None: ...


class PdfIntegrationProtocol(Protocol):
    """Structural protocol for PDF rendering integration dependency."""

    def render(self, context: QuoteRenderContext) -> bytes: ...


class InvoiceService:
    """Coordinate invoice domain rules with persistence and PDF rendering."""

    def __init__(
        self,
        *,
        invoice_repository: InvoiceRepositoryProtocol,
        quote_repository: QuoteRepositoryProtocol,
        pdf_integration: PdfIntegrationProtocol,
        storage_service: StorageReaderProtocol,
    ) -> None:
        self._invoice_repository = invoice_repository
        self._quote_repository = quote_repository
        self._pdf = pdf_integration
        self._storage_service = storage_service

    async def create_invoice(self, user: User, data: InvoiceCreateRequest) -> Document:
        """Create a direct invoice and retry once on sequence collisions."""
        user_id = _resolve_user_id(user)
        customer_exists = await self._invoice_repository.customer_exists_for_user(
            user_id=user_id,
            customer_id=data.customer_id,
        )
        if not customer_exists:
            raise QuoteServiceError(detail="Not found", status_code=404)

        for attempt in range(2):
            try:
                invoice = await self._invoice_repository.create(
                    user_id=user_id,
                    customer_id=data.customer_id,
                    title=data.title,
                    transcript=data.transcript,
                    line_items=data.line_items,
                    total_amount=data.total_amount,
                    notes=data.notes,
                    source_type=data.source_type,
                    due_date=build_default_due_date(),
                )
                await self._invoice_repository.commit()
                log_event(
                    "invoice_created",
                    user_id=user_id,
                    customer_id=invoice.customer_id,
                )
                return invoice
            except IntegrityError as exc:
                await self._invoice_repository.rollback()
                if attempt == 0 and _is_doc_sequence_collision(exc):
                    continue
                raise

        raise QuoteServiceError(detail="Unable to create invoice", status_code=409)

    async def convert_quote_to_invoice(self, user: User, quote_id: UUID) -> Document:
        """Create one invoice from an approved quote."""
        user_id = _resolve_user_id(user)
        quote = await self._quote_repository.get_by_id(quote_id, user_id)
        if quote is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        if quote.status != QuoteStatus.APPROVED:
            raise QuoteServiceError(
                detail="Only approved quotes can be converted to invoices",
                status_code=409,
            )

        existing_invoice = await self._invoice_repository.get_by_source_document_id(
            source_document_id=quote.id,
            user_id=user_id,
        )
        if existing_invoice is not None:
            raise QuoteServiceError(
                detail="An invoice already exists for this quote",
                status_code=409,
            )

        for attempt in range(2):
            try:
                invoice = await self._invoice_repository.create_from_quote(
                    source_quote=quote,
                    due_date=build_default_due_date(),
                )
                await self._invoice_repository.commit()
                break
            except IntegrityError as exc:
                await self._invoice_repository.rollback()
                duplicate_invoice = await self._invoice_repository.get_by_source_document_id(
                    source_document_id=quote.id,
                    user_id=user_id,
                )
                if duplicate_invoice is not None:
                    raise QuoteServiceError(
                        detail="An invoice already exists for this quote",
                        status_code=409,
                    ) from exc
                if attempt == 0 and _is_doc_sequence_collision(exc):
                    continue
                if _is_doc_sequence_collision(exc):
                    raise QuoteServiceError(
                        detail="Unable to create invoice",
                        status_code=409,
                    ) from exc
                raise
        else:
            raise QuoteServiceError(detail="Unable to create invoice", status_code=409)

        log_event(
            "invoice_created",
            user_id=user_id,
            quote_id=quote.id,
            customer_id=invoice.customer_id,
        )
        return invoice

    async def get_invoice_detail(self, user: User, invoice_id: UUID) -> InvoiceDetailRow:
        """Return one user-owned invoice detail row or raise not found."""
        row = await self._invoice_repository.get_detail_by_id(
            invoice_id,
            _resolve_user_id(user),
        )
        if row is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        return row

    async def update_invoice_due_date(
        self,
        user: User,
        invoice_id: UUID,
        due_date: date,
    ) -> Document:
        """Update the due date for an editable invoice."""
        user_id = _resolve_user_id(user)
        invoice = await self._invoice_repository.get_by_id(invoice_id, user_id)
        if invoice is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        if invoice.status not in _EDITABLE_INVOICE_STATUSES:
            raise QuoteServiceError(
                detail="Sent invoices cannot be edited",
                status_code=409,
            )

        updated_invoice = await self._invoice_repository.update_due_date(
            invoice=invoice,
            due_date=due_date,
        )
        await self._invoice_repository.commit()
        return await self._invoice_repository.refresh(updated_invoice)

    async def generate_pdf(self, user: User, invoice_id: UUID) -> tuple[str, bytes]:
        """Render and return invoice PDF bytes while applying ready transition rules."""
        user_id = _resolve_user_id(user)
        context = await self._invoice_repository.get_render_context(invoice_id, user_id)
        if context is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        await self._attach_logo_data_uri(context)

        try:
            pdf_bytes = await asyncio.to_thread(self._pdf.render, context)
        except PdfRenderError as exc:
            raise QuoteServiceError(detail=str(exc), status_code=422) from exc

        await self._invoice_repository.mark_ready_if_draft(invoice_id=invoice_id, user_id=user_id)
        await self._invoice_repository.commit()
        return context.doc_number, pdf_bytes

    async def share_invoice(self, user: User, invoice_id: UUID) -> Document:
        """Create/reuse a share token and transition the invoice to sent."""
        user_id = _resolve_user_id(user)
        invoice = await self._invoice_repository.get_by_id(invoice_id, user_id)
        if invoice is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        if invoice.status == QuoteStatus.SENT:
            return invoice

        if invoice.share_token is None:
            invoice.share_token = str(uuid4())

        invoice.shared_at = _utcnow()
        invoice.status = QuoteStatus.SENT
        await self._invoice_repository.commit()
        return await self._invoice_repository.refresh(invoice)

    async def generate_shared_pdf(self, share_token: str) -> tuple[str, bytes]:
        """Render and return a sent invoice PDF by share token."""
        context = await self._invoice_repository.get_render_context_by_share_token(share_token)
        if context is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        await self._attach_logo_data_uri(context)

        try:
            pdf_bytes = await asyncio.to_thread(self._pdf.render, context)
        except PdfRenderError as exc:
            raise QuoteServiceError(detail=str(exc), status_code=422) from exc

        return context.doc_number, pdf_bytes

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


def get_invoice_repository(db_repository: InvoiceRepository) -> InvoiceRepository:
    """Identity helper used for typing in tests when needed."""
    return db_repository


def _resolve_user_id(user: User) -> UUID:
    identity = sa_inspect(user).identity
    if identity and identity[0] is not None:
        return cast(UUID, identity[0])
    return user.id


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _is_doc_sequence_collision(exc: IntegrityError) -> bool:
    """Return true when IntegrityError was caused by doc-sequence uniqueness collision."""
    return "uq_documents_user_type_sequence" in str(exc.orig)
