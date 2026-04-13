"""Invoice service orchestration.

This module applies invoice domain rules on top of repository reads/writes.
It owns creation, quote conversion, list/detail access, and invoice PDF/share
side effects while preserving quote-service error semantics for the API layer.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Sequence
from datetime import date, datetime
from typing import Protocol, cast
from uuid import UUID

from arq.connections import ArqRedis
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.exc import IntegrityError

from app.features.auth.models import User
from app.features.invoices.repository import (
    InvoiceDetailRow,
    InvoiceFirstViewTransition,
    InvoiceListItemSummary,
    InvoicePublicShareRecord,
    InvoiceRepository,
    build_default_due_date,
)
from app.features.invoices.schemas import InvoiceCreateRequest, InvoiceUpdateRequest
from app.features.invoices.share import InvoiceShareService
from app.features.jobs.models import JobRecord, JobStatus, JobType
from app.features.jobs.service import JobService
from app.features.quotes.models import Document, QuoteStatus
from app.features.quotes.repository import QuoteRenderContext
from app.features.quotes.schemas import LineItemDraft
from app.features.quotes.service import (
    QuoteRepositoryProtocol,
    QuoteServiceError,
    build_doc_number,
    ensure_quote_customer_assigned,
)
from app.integrations.storage import StorageNotFoundError, StorageServiceProtocol
from app.shared.event_logger import log_event
from app.shared.pdf_artifacts import PDF_ARTIFACT_NOT_READY_DETAIL
from app.shared.pricing import (
    PricingValidationError,
    derive_document_subtotal_from_line_items,
    document_field_float_or_none,
    resolve_document_subtotal_for_edit,
    validate_document_pricing_input,
)

LOGGER = logging.getLogger(__name__)
_EDITABLE_INVOICE_STATUSES = frozenset(
    {
        QuoteStatus.DRAFT,
        QuoteStatus.READY,
        QuoteStatus.SENT,
        QuoteStatus.PAID,
        QuoteStatus.VOID,
    }
)
_INVOICE_OUTCOME_MUTABLE_STATUSES = frozenset(
    {
        QuoteStatus.SENT,
        QuoteStatus.PAID,
        QuoteStatus.VOID,
    }
)
_DOC_TYPE_CHANGEABLE_STATUSES = frozenset({QuoteStatus.DRAFT, QuoteStatus.READY})
_DOC_TYPE_CHANGE_STATUS_BLOCKED_DETAIL = (
    "Document type can only be changed in draft or ready status."
)
_DOC_TYPE_CHANGE_SHARED_BLOCKED_DETAIL = "Document type cannot be changed after sharing."
_PDF_JOB_NAME = "jobs.pdf"
_PDF_QUEUE_FAILURE_DETAIL = "Unable to start PDF generation right now. Please try again."


class InvoiceRepositoryProtocol(Protocol):
    """Structural protocol for invoice repository dependencies."""

    async def customer_exists_for_user(self, *, user_id: UUID, customer_id: UUID) -> bool: ...

    async def get_by_id(self, invoice_id: UUID, user_id: UUID) -> Document | None: ...

    async def list_by_user(
        self,
        user_id: UUID,
        customer_id: UUID | None = None,
    ) -> list[InvoiceListItemSummary]: ...

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

    async def get_public_share_record(
        self,
        share_token: str,
    ) -> InvoicePublicShareRecord | None: ...

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
        tax_rate: float | None,
        discount_type: str | None,
        discount_value: float | None,
        deposit_amount: float | None,
        notes: str | None,
        source_type: str,
        due_date: date,
    ) -> Document: ...

    async def update(
        self,
        *,
        invoice: Document,
        title: str | None,
        update_title: bool,
        total_amount: float | None,
        update_total_amount: bool,
        tax_rate: float | None,
        update_tax_rate: bool,
        discount_type: str | None,
        update_discount_type: bool,
        discount_value: float | None,
        update_discount_value: bool,
        deposit_amount: float | None,
        update_deposit_amount: bool,
        notes: str | None,
        update_notes: bool,
        line_items: list[LineItemDraft] | None,
        replace_line_items: bool,
        due_date: date | None,
        update_due_date: bool,
    ) -> Document: ...

    async def invalidate_pdf_artifact(self, invoice: Document) -> str | None: ...

    async def mark_ready_if_draft(self, *, invoice_id: UUID, user_id: UUID) -> None: ...

    async def get_next_doc_sequence_for_type(self, *, user_id: UUID, doc_type: str) -> int: ...

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
        storage_service: StorageServiceProtocol,
    ) -> None:
        self._invoice_repository = invoice_repository
        self._quote_repository = quote_repository
        self._pdf = pdf_integration
        self._storage_service = storage_service
        self._share_service = InvoiceShareService(
            repository=invoice_repository,
            pdf_integration=pdf_integration,
            storage_service=storage_service,
        )

    async def create_invoice(self, user: User, data: InvoiceCreateRequest) -> Document:
        """Create a direct invoice and retry once on sequence collisions."""
        user_id = _resolve_user_id(user)
        customer_exists = await self._invoice_repository.customer_exists_for_user(
            user_id=user_id,
            customer_id=data.customer_id,
        )
        if not customer_exists:
            raise QuoteServiceError(detail="Not found", status_code=404)

        validated_pricing = _validate_document_pricing_for_invoice(
            total_amount=data.total_amount,
            line_items=data.line_items,
            discount_type=data.discount_type,
            discount_value=data.discount_value,
            tax_rate=data.tax_rate,
            deposit_amount=data.deposit_amount,
        )

        for attempt in range(2):
            try:
                invoice = await self._invoice_repository.create(
                    user_id=user_id,
                    customer_id=data.customer_id,
                    title=data.title,
                    transcript=data.transcript,
                    line_items=data.line_items,
                    total_amount=document_field_float_or_none(validated_pricing.total_amount),
                    tax_rate=document_field_float_or_none(validated_pricing.tax_rate),
                    discount_type=validated_pricing.discount_type,
                    discount_value=document_field_float_or_none(validated_pricing.discount_value),
                    deposit_amount=document_field_float_or_none(validated_pricing.deposit_amount),
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
                if _is_doc_sequence_collision(exc):
                    raise QuoteServiceError(
                        detail="Unable to create invoice",
                        status_code=409,
                    ) from exc
                raise

        raise QuoteServiceError(detail="Unable to create invoice", status_code=409)

    async def list_invoices(
        self,
        user: User,
        customer_id: UUID | None = None,
    ) -> list[InvoiceListItemSummary]:
        """List invoices for the authenticated user."""
        return await self._invoice_repository.list_by_user(
            _resolve_user_id(user),
            customer_id=customer_id,
        )

    async def convert_quote_to_invoice(self, user: User, quote_id: UUID) -> Document:
        """Create one invoice from a quote unless a linked invoice already exists."""
        user_id = _resolve_user_id(user)
        quote = await self._quote_repository.get_by_id(quote_id, user_id)
        if quote is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        ensure_quote_customer_assigned(quote)

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

    async def mark_invoice_paid(self, user: User, invoice_id: UUID) -> Document:
        """Mark one invoice as paid without changing share/access capabilities."""
        return await self._mark_invoice_outcome(
            user,
            invoice_id,
            next_status=QuoteStatus.PAID,
            event_name="invoice_paid",
            action_label="paid",
        )

    async def mark_invoice_voided(self, user: User, invoice_id: UUID) -> Document:
        """Mark one invoice as void without changing share/access capabilities."""
        return await self._mark_invoice_outcome(
            user,
            invoice_id,
            next_status=QuoteStatus.VOID,
            event_name="invoice_voided",
            action_label="void",
        )

    async def update_invoice(
        self,
        user: User,
        invoice_id: UUID,
        data: InvoiceUpdateRequest,
    ) -> Document:
        """Patch editable invoice fields while preserving status and share continuity."""
        user_id = _resolve_user_id(user)
        invoice = await self._invoice_repository.get_by_id(invoice_id, user_id)
        if invoice is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        if invoice.status not in _EDITABLE_INVOICE_STATUSES:
            raise QuoteServiceError(
                detail="Invoice cannot be edited",
                status_code=409,
            )
        requested_doc_type = (
            data.doc_type
            if "doc_type" in data.model_fields_set
            else getattr(invoice, "doc_type", "invoice")
        )
        if requested_doc_type is None:
            raise QuoteServiceError(detail="doc_type cannot be null", status_code=422)
        doc_type_changed_to_quote = await self._apply_doc_type_transition(
            user_id=user_id,
            invoice=invoice,
            requested_doc_type=requested_doc_type,
        )

        next_line_items = (
            data.line_items if "line_items" in data.model_fields_set else invoice.line_items
        )
        line_items_define_subtotal, derived_line_item_subtotal = (
            derive_document_subtotal_from_line_items(next_line_items)
        )
        current_subtotal = resolve_document_subtotal_for_edit(
            total_amount=invoice.total_amount,
            discount_type=invoice.discount_type,
            discount_value=invoice.discount_value,
            tax_rate=invoice.tax_rate,
            deposit_amount=invoice.deposit_amount,
            line_items=next_line_items,
        )
        current_pricing = _validate_document_pricing_for_invoice(
            total_amount=(
                data.total_amount
                if "total_amount" in data.model_fields_set
                else (
                    derived_line_item_subtotal
                    if "line_items" in data.model_fields_set and line_items_define_subtotal
                    else current_subtotal
                )
            ),
            line_items=next_line_items,
            discount_type=(
                None
                if "discount_value" in data.model_fields_set and data.discount_value is None
                else (
                    data.discount_type
                    if "discount_type" in data.model_fields_set
                    else invoice.discount_type
                )
            ),
            discount_value=(
                data.discount_value
                if "discount_value" in data.model_fields_set
                else document_field_float_or_none(invoice.discount_value)
            ),
            tax_rate=(
                data.tax_rate
                if "tax_rate" in data.model_fields_set
                else document_field_float_or_none(invoice.tax_rate)
            ),
            deposit_amount=(
                data.deposit_amount
                if "deposit_amount" in data.model_fields_set
                else document_field_float_or_none(invoice.deposit_amount)
            ),
        )
        rendered_fields_changed = (
            _invoice_render_inputs_changed(
                invoice=invoice,
                update_fields=data.model_fields_set,
                next_line_items=next_line_items,
                next_total_amount=document_field_float_or_none(current_pricing.total_amount),
                next_tax_rate=document_field_float_or_none(current_pricing.tax_rate),
                next_discount_type=current_pricing.discount_type,
                next_discount_value=document_field_float_or_none(current_pricing.discount_value),
                next_deposit_amount=document_field_float_or_none(current_pricing.deposit_amount),
                next_title=data.title if "title" in data.model_fields_set else invoice.title,
                next_notes=data.notes if "notes" in data.model_fields_set else invoice.notes,
                next_due_date=(
                    None
                    if doc_type_changed_to_quote
                    else (
                        data.due_date if "due_date" in data.model_fields_set else invoice.due_date
                    )
                ),
            )
            or doc_type_changed_to_quote
        )

        should_update_due_date = (
            "due_date" in data.model_fields_set and not doc_type_changed_to_quote
        )

        try:
            updated_invoice = await self._invoice_repository.update(
                invoice=invoice,
                title=data.title,
                update_title="title" in data.model_fields_set,
                total_amount=document_field_float_or_none(current_pricing.total_amount),
                update_total_amount="total_amount" in data.model_fields_set
                or ("line_items" in data.model_fields_set and line_items_define_subtotal)
                or "discount_type" in data.model_fields_set
                or "discount_value" in data.model_fields_set
                or "tax_rate" in data.model_fields_set,
                tax_rate=document_field_float_or_none(current_pricing.tax_rate),
                update_tax_rate="tax_rate" in data.model_fields_set,
                discount_type=current_pricing.discount_type,
                update_discount_type=(
                    "discount_type" in data.model_fields_set
                    or (
                        "discount_value" in data.model_fields_set
                        and current_pricing.discount_type is None
                    )
                ),
                discount_value=document_field_float_or_none(current_pricing.discount_value),
                update_discount_value="discount_value" in data.model_fields_set,
                deposit_amount=document_field_float_or_none(current_pricing.deposit_amount),
                update_deposit_amount="deposit_amount" in data.model_fields_set,
                notes=data.notes,
                update_notes="notes" in data.model_fields_set,
                line_items=data.line_items,
                replace_line_items="line_items" in data.model_fields_set,
                due_date=None if doc_type_changed_to_quote else data.due_date,
                update_due_date=should_update_due_date,
            )
            obsolete_artifact_path = None
            if rendered_fields_changed:
                obsolete_artifact_path = await self._invoice_repository.invalidate_pdf_artifact(
                    updated_invoice
                )
            await self._invoice_repository.commit()
        except IntegrityError as exc:
            await self._invoice_repository.rollback()
            if doc_type_changed_to_quote and _is_doc_sequence_collision(exc):
                raise QuoteServiceError(
                    detail="Document type change failed, please retry.",
                    status_code=409,
                ) from exc
            raise

        await self._delete_obsolete_artifact(obsolete_artifact_path)
        return await self._invoice_repository.refresh(updated_invoice)

    async def _apply_doc_type_transition(
        self,
        *,
        user_id: UUID,
        invoice: Document,
        requested_doc_type: str,
    ) -> bool:
        current_doc_type = getattr(invoice, "doc_type", "invoice")
        if requested_doc_type == current_doc_type:
            return False
        if requested_doc_type != "quote":
            raise QuoteServiceError(
                detail="Unsupported document type transition",
                status_code=409,
            )
        if invoice.share_token is not None:
            raise QuoteServiceError(
                detail=_DOC_TYPE_CHANGE_SHARED_BLOCKED_DETAIL,
                status_code=409,
            )
        if invoice.status not in _DOC_TYPE_CHANGEABLE_STATUSES:
            raise QuoteServiceError(
                detail=_DOC_TYPE_CHANGE_STATUS_BLOCKED_DETAIL,
                status_code=409,
            )
        if invoice.source_document_id is not None:
            raise QuoteServiceError(
                detail="Invoices created from quotes cannot be converted to quotes.",
                status_code=409,
            )

        next_sequence = await self._invoice_repository.get_next_doc_sequence_for_type(
            user_id=user_id,
            doc_type="quote",
        )
        invoice.doc_type = "quote"
        invoice.doc_sequence = next_sequence
        invoice.doc_number = build_doc_number(doc_type="quote", sequence=next_sequence)
        invoice.due_date = None
        return True

    async def start_pdf_generation(
        self,
        user: User,
        invoice_id: UUID,
        *,
        job_service: JobService,
        arq_pool: ArqRedis | None,
    ) -> JobRecord:
        """Create or reuse a durable invoice PDF job for the current artifact revision."""
        user_id = _resolve_user_id(user)
        invoice = await self._invoice_repository.get_by_id(invoice_id, user_id)
        if invoice is None:
            raise QuoteServiceError(detail="Not found", status_code=404)

        existing_job = await self._get_reusable_pdf_job(
            job_service=job_service,
            user_id=user_id,
            document=invoice,
        )
        if existing_job is not None:
            return existing_job

        attach_job_to_document = invoice.pdf_artifact_path is None
        job = await job_service.create_job(
            user_id=user_id,
            job_type=JobType.PDF,
            document_id=invoice.id,
            document_revision=invoice.pdf_artifact_revision,
        )
        if attach_job_to_document:
            invoice.pdf_artifact_job_id = job.id

        try:
            if arq_pool is None:
                raise RuntimeError("ARQ pool is not available")
            queued_job = await arq_pool.enqueue_job(
                _PDF_JOB_NAME,
                str(job.id),
                _job_id=str(job.id),
            )
            if queued_job is None:
                raise RuntimeError("ARQ did not accept the PDF job")
        except Exception as exc:
            LOGGER.warning("Failed to enqueue invoice PDF job %s", job.id, exc_info=True)
            if attach_job_to_document:
                invoice.pdf_artifact_job_id = None
            await job_service.mark_enqueue_failed(job.id, job_type=JobType.PDF)
            await self._invoice_repository.commit()
            raise QuoteServiceError(detail=_PDF_QUEUE_FAILURE_DETAIL, status_code=503) from exc

        await self._invoice_repository.commit()
        return job

    async def get_pdf_artifact(self, user: User, invoice_id: UUID) -> tuple[str, bytes]:
        """Return one persisted invoice PDF artifact or a stable not-ready error."""
        user_id = _resolve_user_id(user)
        invoice = await self._invoice_repository.get_by_id(invoice_id, user_id)
        if invoice is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        if invoice.pdf_artifact_path is None:
            raise QuoteServiceError(detail=PDF_ARTIFACT_NOT_READY_DETAIL, status_code=409)

        try:
            pdf_bytes = await asyncio.to_thread(
                self._storage_service.fetch_bytes,
                invoice.pdf_artifact_path,
            )
        except StorageNotFoundError as exc:
            invoice.pdf_artifact_path = None
            invoice.pdf_artifact_job_id = None
            # Keep the artifact revision unchanged here: storage-loss recovery should
            # regenerate and overwrite the same revision path, while true content
            # invalidation paths are the only flows that bump revision.
            await self._invoice_repository.commit()
            raise QuoteServiceError(detail=PDF_ARTIFACT_NOT_READY_DETAIL, status_code=409) from exc
        except Exception as exc:  # noqa: BLE001
            raise QuoteServiceError(detail="Unable to load PDF artifact", status_code=500) from exc

        return invoice.doc_number, pdf_bytes

    async def share_invoice(
        self,
        user: User,
        invoice_id: UUID,
        *,
        regenerate: bool = False,
    ) -> Document:
        """Create/reuse a share token without regressing paid/void outcome labels."""
        return await self._share_service.share_invoice(
            user_id=_resolve_user_id(user),
            invoice_id=invoice_id,
            regenerate=regenerate,
        )

    async def revoke_public_share(self, user: User, invoice_id: UUID) -> None:
        """Revoke the currently active public share token for one invoice."""
        await self._share_service.revoke_public_share(
            user_id=_resolve_user_id(user),
            invoice_id=invoice_id,
        )

    async def generate_shared_pdf(self, share_token: str) -> tuple[str, bytes]:
        """Render and return one shared invoice PDF by share token."""
        return await self._share_service.generate_shared_pdf(share_token)

    async def get_public_invoice(self, share_token: str) -> QuoteRenderContext:
        """Return public invoice data and emit the first-view event exactly once."""
        return await self._share_service.get_public_invoice(share_token)

    async def get_public_logo(self, share_token: str) -> tuple[bytes, str]:
        """Return public logo bytes/content type for one shared invoice token."""
        return await self._share_service.get_public_logo(share_token)

    async def _get_reusable_pdf_job(
        self,
        *,
        job_service: JobService,
        user_id: UUID,
        document: Document,
    ) -> JobRecord | None:
        if document.pdf_artifact_job_id is None:
            return None

        job = await job_service.get_job_for_user(
            job_id=document.pdf_artifact_job_id,
            user_id=user_id,
        )
        if (
            job is None
            or job.job_type != JobType.PDF
            or job.document_revision != document.pdf_artifact_revision
            or job.status not in {JobStatus.PENDING, JobStatus.RUNNING}
        ):
            return None
        return job

    async def _mark_invoice_outcome(
        self,
        user: User,
        invoice_id: UUID,
        *,
        next_status: QuoteStatus,
        event_name: str,
        action_label: str,
    ) -> Document:
        user_id = _resolve_user_id(user)
        invoice = await self._invoice_repository.get_by_id(invoice_id, user_id)
        if invoice is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        if invoice.status == next_status:
            return invoice
        if invoice.status not in _INVOICE_OUTCOME_MUTABLE_STATUSES:
            raise QuoteServiceError(
                detail=f"Only sent, paid, or void invoices can be marked {action_label}.",
                status_code=409,
            )

        invoice.status = next_status
        await self._invoice_repository.commit()
        refreshed_invoice = await self._invoice_repository.refresh(invoice)
        log_event(
            event_name,
            user_id=user_id,
            invoice_id=refreshed_invoice.id,
            customer_id=refreshed_invoice.customer_id,
        )
        return refreshed_invoice

    async def _delete_obsolete_artifact(self, object_path: str | None) -> None:
        if object_path is None:
            return
        try:
            await asyncio.to_thread(self._storage_service.delete, object_path)
        except Exception:  # noqa: BLE001
            LOGGER.warning("Failed to delete invalidated invoice PDF artifact", exc_info=True)


def get_invoice_repository(db_repository: InvoiceRepository) -> InvoiceRepository:
    """Identity helper used for typing in tests when needed."""
    return db_repository


def _resolve_user_id(user: User) -> UUID:
    identity = sa_inspect(user).identity
    if identity and identity[0] is not None:
        return cast(UUID, identity[0])
    return user.id


def _is_doc_sequence_collision(exc: IntegrityError) -> bool:
    """Return true when IntegrityError was caused by doc-sequence uniqueness collision."""
    message = str(exc.orig)
    return "uq_documents_user_type_sequence" in message


def _validate_document_pricing_for_invoice(
    *,
    total_amount: float | None,
    line_items: Sequence[object] | None,
    discount_type: str | None,
    discount_value: float | None,
    tax_rate: float | None,
    deposit_amount: float | None,
):
    try:
        return validate_document_pricing_input(
            total_amount=total_amount,
            line_items=line_items,
            discount_type=discount_type,
            discount_value=discount_value,
            tax_rate=tax_rate,
            deposit_amount=deposit_amount,
        )
    except PricingValidationError as exc:
        raise QuoteServiceError(detail=str(exc), status_code=422) from exc


def _invoice_render_inputs_changed(
    *,
    invoice: Document,
    update_fields: set[str],
    next_line_items: Sequence[object] | None,
    next_total_amount: float | None,
    next_tax_rate: float | None,
    next_discount_type: str | None,
    next_discount_value: float | None,
    next_deposit_amount: float | None,
    next_title: str | None,
    next_notes: str | None,
    next_due_date: date | None,
) -> bool:
    return any(
        (
            invoice.title != next_title,
            invoice.notes != next_notes,
            invoice.due_date != next_due_date,
            document_field_float_or_none(invoice.total_amount) != next_total_amount,
            document_field_float_or_none(invoice.tax_rate) != next_tax_rate,
            invoice.discount_type != next_discount_type,
            document_field_float_or_none(invoice.discount_value) != next_discount_value,
            document_field_float_or_none(invoice.deposit_amount) != next_deposit_amount,
            "line_items" in update_fields
            and _line_item_snapshots(invoice.line_items) != _line_item_snapshots(next_line_items),
        )
    )


def _line_item_snapshots(
    line_items: Sequence[object] | None,
) -> list[tuple[str | None, str | None, float | None]]:
    return [
        (
            cast(str | None, getattr(line_item, "description", None)),
            cast(str | None, getattr(line_item, "details", None)),
            document_field_float_or_none(getattr(line_item, "price", None)),
        )
        for line_item in (line_items or ())
    ]
