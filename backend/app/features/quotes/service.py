"""Quote service orchestration."""

from __future__ import annotations

import asyncio
import base64
import logging
import re
from collections.abc import Sequence
from datetime import UTC, date, datetime, timedelta
from typing import Literal, Protocol, cast
from uuid import UUID, uuid4

from arq.connections import ArqRedis
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.exc import IntegrityError

from app.core.config import get_settings
from app.features.auth.models import User
from app.features.jobs.models import JobRecord, JobStatus, JobType
from app.features.jobs.service import JobService
from app.features.quotes.extraction_outcomes import classify_extraction_result
from app.features.quotes.models import Document, QuoteStatus
from app.features.quotes.repository import (
    PublicShareRecord,
    QuoteDetailRow,
    QuoteListItemSummary,
    QuoteRenderContext,
    QuoteViewTransition,
)
from app.features.quotes.schemas import (
    ExtractionResult,
    LineItemDraft,
    QuoteCreateRequest,
    QuoteUpdateRequest,
)
from app.integrations.pdf import PdfRenderError
from app.integrations.storage import StorageNotFoundError, StorageServiceProtocol
from app.shared.event_logger import log_event
from app.shared.image_signatures import detect_image_content_type
from app.shared.observability import (
    current_request_context,
    hash_token_reference,
    log_security_event,
)
from app.shared.pdf_artifacts import PDF_ARTIFACT_NOT_READY_DETAIL
from app.shared.pricing import (
    PricingValidationError,
    derive_document_subtotal_from_line_items,
    document_field_float_or_none,
    resolve_document_subtotal_for_edit,
    validate_document_pricing_input,
)

LOGGER = logging.getLogger(__name__)
_PDF_JOB_NAME = "jobs.pdf"
_PDF_QUEUE_FAILURE_DETAIL = "Unable to start PDF generation right now. Please try again."
_NON_DELETABLE_QUOTE_STATUSES = frozenset(
    {
        QuoteStatus.SHARED,
        QuoteStatus.VIEWED,
        QuoteStatus.APPROVED,
        QuoteStatus.DECLINED,
    }
)
_TERMINAL_QUOTE_STATUSES = frozenset({QuoteStatus.APPROVED, QuoteStatus.DECLINED})
_QUOTE_OUTCOME_ELIGIBLE_STATUSES = (
    QuoteStatus.DRAFT,
    QuoteStatus.READY,
    QuoteStatus.SHARED,
    QuoteStatus.VIEWED,
    QuoteStatus.APPROVED,
    QuoteStatus.DECLINED,
)
_POST_SHARE_NON_REGRESSION_STATUSES = frozenset(
    {
        QuoteStatus.VIEWED,
        QuoteStatus.APPROVED,
        QuoteStatus.DECLINED,
    }
)
_CUSTOMER_ASSIGNMENT_REQUIRED_DETAIL = "Assign a customer before continuing."
_CUSTOMER_CLEAR_BLOCKED_DETAIL = "Customer cannot be cleared from a quote."
_CUSTOMER_CHANGE_BLOCKED_DETAIL = "Customer cannot be changed after sharing or invoice conversion."
_DOC_TYPE_CHANGE_STATUS_BLOCKED_DETAIL = (
    "Document type can only be changed in draft or ready status."
)
_DOC_TYPE_CHANGE_SHARED_BLOCKED_DETAIL = "Document type cannot be changed after sharing."
_CUSTOMER_REASSIGNABLE_STATUSES = frozenset({QuoteStatus.DRAFT, QuoteStatus.READY})
_DOC_TYPE_CHANGEABLE_STATUSES = frozenset({QuoteStatus.DRAFT, QuoteStatus.READY})
_APPENDABLE_QUOTE_STATUSES = frozenset(
    {
        QuoteStatus.DRAFT,
        QuoteStatus.READY,
        QuoteStatus.SHARED,
        QuoteStatus.VIEWED,
        QuoteStatus.APPROVED,
        QuoteStatus.DECLINED,
    }
)
_APPEND_UNAVAILABLE_DETAIL = "This quote can no longer be edited."
_APPEND_TRANSCRIPT_SEPARATOR_PATTERN = re.compile(r"(?:^|\n\n)Added later(?: \(\d+\))?:\n")
_APPEND_TRANSCRIPT_BULLET_PREFIXES = ("- ", "* ")


class QuoteServiceError(Exception):
    """Quote-domain exception mapped to an HTTP status code."""

    def __init__(self, *, detail: str, status_code: int) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class QuoteRepositoryProtocol(Protocol):
    """Structural protocol for quote repository dependencies."""

    async def customer_exists_for_user(self, *, user_id: UUID, customer_id: UUID) -> bool: ...

    async def list_by_user(
        self,
        user_id: UUID,
        customer_id: UUID | None = None,
    ) -> list[QuoteListItemSummary]: ...

    async def get_by_id(self, quote_id: UUID, user_id: UUID) -> Document | None: ...

    async def get_detail_by_id(self, quote_id: UUID, user_id: UUID) -> QuoteDetailRow | None: ...

    async def has_linked_invoice(
        self,
        *,
        source_document_id: UUID,
        user_id: UUID,
    ) -> bool: ...

    async def get_next_doc_sequence_for_type(self, *, user_id: UUID, doc_type: str) -> int: ...

    async def get_render_context(
        self, quote_id: UUID, user_id: UUID
    ) -> QuoteRenderContext | None: ...

    async def get_render_context_by_share_token(
        self, share_token: str
    ) -> QuoteRenderContext | None: ...

    async def transition_to_viewed_by_share_token(
        self,
        share_token: str,
        *,
        accessed_at: datetime,
    ) -> QuoteViewTransition | None: ...

    async def get_public_share_record(self, share_token: str) -> PublicShareRecord | None: ...

    async def touch_last_public_accessed_at_by_share_token(
        self,
        share_token: str,
        *,
        accessed_at: datetime,
    ) -> None: ...

    async def mark_ready_if_not_shared(self, *, quote_id: UUID, user_id: UUID) -> None: ...

    async def set_quote_outcome(
        self,
        *,
        quote_id: UUID,
        user_id: UUID,
        status: QuoteStatus,
        allowed_current_statuses: tuple[QuoteStatus, ...],
    ) -> Document | None: ...

    async def create(
        self,
        *,
        user_id: UUID,
        customer_id: UUID | None,
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
        extraction_tier: str | None = None,
        extraction_degraded_reason_code: str | None = None,
    ) -> Document: ...

    async def update(
        self,
        *,
        document: Document,
        customer_id: UUID | None,
        update_customer_id: bool,
        title: str | None,
        update_title: bool,
        transcript: str | None,
        update_transcript: bool,
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
    ) -> Document: ...

    async def invalidate_pdf_artifact(self, document: Document) -> str | None: ...

    async def append_extraction(
        self,
        *,
        document: Document,
        transcript: str,
        total_amount: float | None,
        line_items: list[LineItemDraft],
        extraction_tier: str | None = None,
        extraction_degraded_reason_code: str | None = None,
    ) -> Document: ...

    async def delete(self, document_id: UUID) -> None: ...

    async def commit(self) -> None: ...

    async def refresh(self, document: Document) -> Document: ...

    async def rollback(self) -> None: ...


class PdfIntegrationProtocol(Protocol):
    """Structural protocol for PDF rendering integration dependency."""

    def render(self, context: QuoteRenderContext) -> bytes: ...


class QuoteService:
    """Coordinate quote domain rules with persistence and PDF rendering."""

    def __init__(
        self,
        *,
        repository: QuoteRepositoryProtocol,
        pdf_integration: PdfIntegrationProtocol,
        storage_service: StorageServiceProtocol,
    ) -> None:
        self._repository = repository
        self._pdf = pdf_integration
        self._storage_service = storage_service

    async def create_quote(self, user: User, data: QuoteCreateRequest) -> Document:
        """Create a user-owned quote and retry once on sequence collisions."""
        user_id = _resolve_user_id(user)
        await self.ensure_customer_exists_for_user(
            user_id=user_id,
            customer_id=data.customer_id,
        )

        validated_pricing = _validate_document_pricing_for_quote(
            total_amount=data.total_amount,
            line_items=data.line_items,
            discount_type=data.discount_type,
            discount_value=data.discount_value,
            tax_rate=data.tax_rate,
            deposit_amount=data.deposit_amount,
        )

        quote = await _create_quote_document(
            self,
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
        )
        await self._repository.commit()
        log_event(
            "quote.created",
            user_id=user_id,
            quote_id=quote.id,
            customer_id=quote.customer_id,
        )
        return quote

    async def ensure_customer_exists_for_user(
        self,
        *,
        user_id: UUID,
        customer_id: UUID | None,
    ) -> None:
        """Reject missing or foreign customer ids when one is supplied."""
        if customer_id is None:
            return
        customer_exists = await self._repository.customer_exists_for_user(
            user_id=user_id,
            customer_id=customer_id,
        )
        if not customer_exists:
            raise QuoteServiceError(detail="Not found", status_code=404)

    async def create_extracted_draft(
        self,
        *,
        user_id: UUID,
        customer_id: UUID | None,
        extraction_result: ExtractionResult,
        source_type: Literal["text", "voice"],
        commit: bool = True,
    ) -> Document:
        """Persist one extraction result as a draft quote."""
        await self.ensure_customer_exists_for_user(
            user_id=user_id,
            customer_id=customer_id,
        )
        extraction_metadata = classify_extraction_result(extraction_result)
        try:
            quote = await _create_quote_document(
                self,
                user_id=user_id,
                customer_id=customer_id,
                title=None,
                transcript=extraction_result.transcript,
                line_items=[
                    LineItemDraft(
                        description=item.description,
                        details=item.details,
                        price=item.price,
                    )
                    for item in extraction_result.line_items
                ],
                total_amount=extraction_result.total,
                tax_rate=None,
                discount_type=None,
                discount_value=None,
                deposit_amount=None,
                notes=None,
                source_type=source_type,
                extraction_tier=extraction_metadata.tier,
                extraction_degraded_reason_code=extraction_metadata.degraded_reason_code,
            )
        except QuoteServiceError:
            raise
        except Exception as exc:  # noqa: BLE001
            await self._repository.rollback()
            raise QuoteServiceError(
                detail="Unable to save extracted draft right now. Please try again.",
                status_code=503,
            ) from exc
        if not commit:
            return quote

        try:
            await self._repository.commit()
        except Exception as exc:  # noqa: BLE001
            await self._repository.rollback()
            raise QuoteServiceError(
                detail="Unable to save extracted draft right now. Please try again.",
                status_code=503,
            ) from exc
        return quote

    async def ensure_quote_appendable(
        self,
        *,
        user_id: UUID,
        quote_id: UUID,
    ) -> Document:
        """Return one owned quote that can accept append extraction updates."""
        quote = await self._repository.get_by_id(quote_id, user_id)
        if quote is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        if quote.status not in _APPENDABLE_QUOTE_STATUSES:
            raise QuoteServiceError(detail=_APPEND_UNAVAILABLE_DETAIL, status_code=409)
        return quote

    async def append_extraction_to_quote(
        self,
        *,
        user_id: UUID,
        quote_id: UUID,
        extraction_result: ExtractionResult,
        commit: bool = True,
    ) -> tuple[Document, ExtractionResult]:
        """Append extraction output onto an existing persisted quote."""
        quote = await self.ensure_quote_appendable(user_id=user_id, quote_id=quote_id)
        appended_line_items = [
            LineItemDraft(
                description=item.description,
                details=item.details,
                price=item.price,
            )
            for item in extraction_result.line_items
        ]
        merged_line_items = [
            *[
                LineItemDraft(
                    description=line_item.description,
                    details=line_item.details,
                    price=document_field_float_or_none(line_item.price),
                )
                for line_item in quote.line_items
            ],
            *appended_line_items,
        ]
        line_items_define_subtotal, derived_line_item_subtotal = (
            derive_document_subtotal_from_line_items(merged_line_items)
        )
        current_subtotal = resolve_document_subtotal_for_edit(
            total_amount=quote.total_amount,
            discount_type=quote.discount_type,
            discount_value=quote.discount_value,
            tax_rate=quote.tax_rate,
            deposit_amount=quote.deposit_amount,
            line_items=merged_line_items,
        )
        validated_pricing = _validate_document_pricing_for_quote(
            total_amount=(
                derived_line_item_subtotal if line_items_define_subtotal else current_subtotal
            ),
            line_items=merged_line_items,
            discount_type=quote.discount_type,
            discount_value=document_field_float_or_none(quote.discount_value),
            tax_rate=document_field_float_or_none(quote.tax_rate),
            deposit_amount=document_field_float_or_none(quote.deposit_amount),
        )

        next_transcript = _merge_append_transcript(
            current_transcript=quote.transcript,
            appended_transcript=extraction_result.transcript,
        )
        extraction_metadata = classify_extraction_result(extraction_result)
        updated_quote = await self._repository.append_extraction(
            document=quote,
            transcript=next_transcript,
            total_amount=document_field_float_or_none(validated_pricing.total_amount),
            line_items=appended_line_items,
            extraction_tier=extraction_metadata.tier,
            extraction_degraded_reason_code=extraction_metadata.degraded_reason_code,
        )
        obsolete_artifact_path = await self._repository.invalidate_pdf_artifact(updated_quote)
        if not commit:
            return updated_quote, extraction_result

        await self._repository.commit()
        await self._delete_obsolete_artifact(obsolete_artifact_path)
        return await self._repository.refresh(updated_quote), extraction_result

    async def list_quotes(
        self,
        user: User,
        customer_id: UUID | None = None,
    ) -> list[QuoteListItemSummary]:
        """List quotes for the authenticated user."""
        return await self._repository.list_by_user(
            _resolve_user_id(user),
            customer_id=customer_id,
        )

    async def get_quote(self, user: User, quote_id: UUID) -> Document:
        """Return one user-owned quote or raise not found."""
        quote = await self._repository.get_by_id(quote_id, _resolve_user_id(user))
        if quote is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        return quote

    async def get_quote_detail(self, user: User, quote_id: UUID) -> QuoteDetailRow:
        """Return one user-owned quote detail row or raise not found."""
        row = await self._repository.get_detail_by_id(quote_id, _resolve_user_id(user))
        if row is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        return row

    async def update_quote(
        self,
        user: User,
        quote_id: UUID,
        data: QuoteUpdateRequest,
    ) -> Document:
        """Patch editable quote fields and optionally replace line items."""
        user_id = _resolve_user_id(user)
        quote = await self._repository.get_by_id(quote_id, user_id)
        if quote is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        has_linked_invoice: bool | None = None
        next_customer_id = quote.customer_id
        if "customer_id" in data.model_fields_set:
            has_linked_invoice = await self._repository.has_linked_invoice(
                source_document_id=quote.id,
                user_id=user_id,
            )
            next_customer_id = await self._resolve_next_customer_id(
                user_id=user_id,
                quote=quote,
                requested_customer_id=data.customer_id,
                has_linked_invoice=has_linked_invoice,
            )
        requested_doc_type = (
            data.doc_type
            if "doc_type" in data.model_fields_set
            else getattr(quote, "doc_type", "quote")
        )
        if requested_doc_type is None:
            raise QuoteServiceError(detail="doc_type cannot be null", status_code=422)
        doc_type_changed = await self._apply_doc_type_transition(
            user_id=user_id,
            quote=quote,
            requested_doc_type=requested_doc_type,
            requested_due_date=(data.due_date if "due_date" in data.model_fields_set else None),
            has_linked_invoice=has_linked_invoice,
        )

        next_line_items = (
            data.line_items if "line_items" in data.model_fields_set else quote.line_items
        )
        line_items_define_subtotal, derived_line_item_subtotal = (
            derive_document_subtotal_from_line_items(next_line_items)
        )
        current_subtotal = resolve_document_subtotal_for_edit(
            total_amount=quote.total_amount,
            discount_type=quote.discount_type,
            discount_value=quote.discount_value,
            tax_rate=quote.tax_rate,
            deposit_amount=quote.deposit_amount,
            line_items=next_line_items,
        )
        current_pricing = _validate_document_pricing_for_quote(
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
                    else quote.discount_type
                )
            ),
            discount_value=(
                data.discount_value
                if "discount_value" in data.model_fields_set
                else document_field_float_or_none(quote.discount_value)
            ),
            tax_rate=(
                data.tax_rate
                if "tax_rate" in data.model_fields_set
                else document_field_float_or_none(quote.tax_rate)
            ),
            deposit_amount=(
                data.deposit_amount
                if "deposit_amount" in data.model_fields_set
                else document_field_float_or_none(quote.deposit_amount)
            ),
        )
        rendered_fields_changed = (
            _quote_render_inputs_changed(
                quote=quote,
                update_fields=data.model_fields_set,
                next_customer_id=next_customer_id,
                next_line_items=next_line_items,
                next_total_amount=document_field_float_or_none(current_pricing.total_amount),
                next_tax_rate=document_field_float_or_none(current_pricing.tax_rate),
                next_discount_type=current_pricing.discount_type,
                next_discount_value=document_field_float_or_none(current_pricing.discount_value),
                next_deposit_amount=document_field_float_or_none(current_pricing.deposit_amount),
                next_title=data.title if "title" in data.model_fields_set else quote.title,
                next_notes=data.notes if "notes" in data.model_fields_set else quote.notes,
            )
            or doc_type_changed
        )

        try:
            updated_quote = await self._repository.update(
                document=quote,
                customer_id=next_customer_id,
                update_customer_id="customer_id" in data.model_fields_set,
                title=data.title,
                update_title="title" in data.model_fields_set,
                transcript=data.transcript,
                update_transcript="transcript" in data.model_fields_set,
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
            )
            obsolete_artifact_path = None
            if rendered_fields_changed:
                obsolete_artifact_path = await self._repository.invalidate_pdf_artifact(
                    updated_quote
                )
            await self._repository.commit()
        except IntegrityError as exc:
            await self._repository.rollback()
            if doc_type_changed and _is_doc_sequence_collision(exc):
                raise QuoteServiceError(
                    detail="Document type change failed, please retry.",
                    status_code=409,
                ) from exc
            raise

        await self._delete_obsolete_artifact(obsolete_artifact_path)
        log_event(
            "quote.updated",
            user_id=user_id,
            quote_id=updated_quote.id,
            customer_id=updated_quote.customer_id,
        )
        return await self._repository.refresh(updated_quote)

    async def delete_quote(self, user: User, quote_id: UUID) -> None:
        """Delete a user-owned quote unless it has already been shared."""
        user_id = _resolve_user_id(user)
        quote = await self._repository.get_by_id(quote_id, user_id)
        if quote is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        if quote.status in _NON_DELETABLE_QUOTE_STATUSES:
            raise QuoteServiceError(
                detail="Shared quotes cannot be deleted",
                status_code=409,
            )

        await self._repository.delete(quote_id)
        await self._repository.commit()
        log_event(
            "quote.deleted",
            user_id=user_id,
            quote_id=quote.id,
            customer_id=quote.customer_id,
        )

    async def start_pdf_generation(
        self,
        user: User,
        quote_id: UUID,
        *,
        job_service: JobService,
        arq_pool: ArqRedis | None,
    ) -> JobRecord:
        """Create or reuse a durable quote PDF job for the current artifact revision."""
        user_id = _resolve_user_id(user)
        quote = await self._repository.get_by_id(quote_id, user_id)
        if quote is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        ensure_quote_customer_assigned(quote)

        existing_job = await self._get_reusable_pdf_job(
            job_service=job_service,
            user_id=user_id,
            document=quote,
        )
        if existing_job is not None:
            return existing_job

        attach_job_to_document = quote.pdf_artifact_path is None
        job = await job_service.create_job(
            user_id=user_id,
            job_type=JobType.PDF,
            document_id=quote.id,
            document_revision=quote.pdf_artifact_revision,
        )
        if attach_job_to_document:
            quote.pdf_artifact_job_id = job.id

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
            LOGGER.warning("Failed to enqueue quote PDF job %s", job.id, exc_info=True)
            if attach_job_to_document:
                quote.pdf_artifact_job_id = None
            await job_service.mark_enqueue_failed(job.id, job_type=JobType.PDF)
            await self._repository.commit()
            raise QuoteServiceError(detail=_PDF_QUEUE_FAILURE_DETAIL, status_code=503) from exc

        await self._repository.commit()
        return job

    async def get_pdf_artifact(self, user: User, quote_id: UUID) -> tuple[str, bytes]:
        """Return one persisted quote PDF artifact or a stable not-ready error."""
        quote = await self.get_quote(user, quote_id)
        if quote.pdf_artifact_path is None:
            raise QuoteServiceError(detail=PDF_ARTIFACT_NOT_READY_DETAIL, status_code=409)

        try:
            pdf_bytes = await asyncio.to_thread(
                self._storage_service.fetch_bytes,
                quote.pdf_artifact_path,
            )
        except StorageNotFoundError as exc:
            quote.pdf_artifact_path = None
            quote.pdf_artifact_job_id = None
            # Keep the artifact revision unchanged here: storage-loss recovery should
            # regenerate and overwrite the same revision path, while true content
            # invalidation paths are the only flows that bump revision.
            await self._repository.commit()
            raise QuoteServiceError(detail=PDF_ARTIFACT_NOT_READY_DETAIL, status_code=409) from exc
        except Exception as exc:  # noqa: BLE001
            raise QuoteServiceError(detail="Unable to load PDF artifact", status_code=500) from exc

        return quote.doc_number, pdf_bytes

    async def generate_shared_pdf(self, share_token: str) -> tuple[str, bytes]:
        """Render and return a publicly shared quote PDF by token."""
        context = await self._get_public_quote_context(share_token)
        await self._attach_logo_data_uri(context)

        try:
            pdf_bytes = await asyncio.to_thread(self._pdf.render, context)
        except PdfRenderError as exc:
            raise QuoteServiceError(detail=str(exc), status_code=422) from exc

        await self._mark_public_quote_viewed_once(context, share_token)
        return context.doc_number, pdf_bytes

    async def get_public_quote(self, share_token: str) -> QuoteRenderContext:
        """Return public quote data and apply the first shared->viewed transition once."""
        context = await self._get_public_quote_context(share_token)
        await self._mark_public_quote_viewed_once(context, share_token)
        return context

    async def get_public_logo(self, share_token: str) -> tuple[bytes, str]:
        """Return public logo bytes/content type for one shared quote token."""
        context = await self._get_public_quote_context(share_token)
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

    async def _get_public_quote_context(self, share_token: str) -> QuoteRenderContext:
        """Load public quote context for a share token or raise a 404."""
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

    async def _mark_public_quote_viewed_once(
        self,
        context: QuoteRenderContext,
        share_token: str,
    ) -> None:
        """Advance a shared public quote to viewed and log the first successful access."""
        accessed_at = _utcnow()
        if context.status != QuoteStatus.SHARED.value:
            await self._repository.touch_last_public_accessed_at_by_share_token(
                share_token,
                accessed_at=accessed_at,
            )
            await self._repository.commit()
            return

        transition = await self._repository.transition_to_viewed_by_share_token(
            share_token,
            accessed_at=accessed_at,
        )
        if transition is not None:
            await self._repository.commit()
            self._log_public_quote_viewed(transition)
            context.status = QuoteStatus.VIEWED.value
            return

        await self._repository.touch_last_public_accessed_at_by_share_token(
            share_token,
            accessed_at=accessed_at,
        )
        await self._repository.commit()
        refreshed_context = await self._repository.get_render_context_by_share_token(share_token)
        if refreshed_context is not None:
            context.status = refreshed_context.status

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

    async def _delete_obsolete_artifact(self, object_path: str | None) -> None:
        if object_path is None:
            return
        try:
            await asyncio.to_thread(self._storage_service.delete, object_path)
        except Exception:  # noqa: BLE001
            LOGGER.warning("Failed to delete invalidated quote PDF artifact", exc_info=True)

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

    async def share_quote(
        self,
        user: User,
        quote_id: UUID,
        *,
        regenerate: bool = False,
    ) -> Document:
        """Set share token/timestamp and transition quote status to shared."""
        user_id = _resolve_user_id(user)
        quote = await self._repository.get_by_id(quote_id, user_id)
        if quote is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        ensure_quote_customer_assigned(quote)
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

    async def _apply_doc_type_transition(
        self,
        *,
        user_id: UUID,
        quote: Document,
        requested_doc_type: str,
        requested_due_date: date | None,
        has_linked_invoice: bool | None,
    ) -> bool:
        current_doc_type = getattr(quote, "doc_type", "quote")
        if requested_doc_type == current_doc_type:
            return False
        if requested_doc_type != "invoice":
            raise QuoteServiceError(
                detail="Unsupported document type transition",
                status_code=409,
            )
        if quote.share_token is not None:
            raise QuoteServiceError(
                detail=_DOC_TYPE_CHANGE_SHARED_BLOCKED_DETAIL,
                status_code=409,
            )
        if quote.status not in _DOC_TYPE_CHANGEABLE_STATUSES:
            raise QuoteServiceError(
                detail=_DOC_TYPE_CHANGE_STATUS_BLOCKED_DETAIL,
                status_code=409,
            )

        linked_invoice = has_linked_invoice
        if linked_invoice is None:
            linked_invoice = await self._repository.has_linked_invoice(
                source_document_id=quote.id,
                user_id=user_id,
            )
        if linked_invoice:
            raise QuoteServiceError(
                detail="An invoice already exists for this quote",
                status_code=409,
            )

        ensure_quote_customer_assigned(quote)
        next_sequence = await self._repository.get_next_doc_sequence_for_type(
            user_id=user_id,
            doc_type="invoice",
        )
        quote.doc_type = "invoice"
        quote.doc_sequence = next_sequence
        quote.doc_number = build_doc_number(doc_type="invoice", sequence=next_sequence)
        quote.due_date = (
            requested_due_date
            if requested_due_date is not None
            else _build_default_invoice_due_date()
        )
        return True

    async def revoke_public_share(self, user: User, quote_id: UUID) -> None:
        """Revoke the currently active public share token for one quote."""
        user_id = _resolve_user_id(user)
        quote = await self._repository.get_by_id(quote_id, user_id)
        if quote is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        if quote.share_token is None or quote.share_token_revoked_at is not None:
            return

        quote.share_token_revoked_at = _utcnow()
        await self._repository.commit()

    async def mark_quote_outcome(
        self,
        user: User,
        quote_id: UUID,
        outcome: Literal["approved", "declined"],
    ) -> Document:
        """Record a contractor-controlled quote outcome without changing share state."""
        user_id = _resolve_user_id(user)
        quote = await self._repository.get_by_id(quote_id, user_id)
        if quote is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        next_status = QuoteStatus.APPROVED if outcome == "approved" else QuoteStatus.DECLINED
        if quote.status == next_status:
            return quote

        event_name = "quote_approved" if outcome == "approved" else "quote_marked_lost"
        updated_quote = await self._repository.set_quote_outcome(
            quote_id=quote_id,
            user_id=user_id,
            status=next_status,
            allowed_current_statuses=tuple(
                status for status in _QUOTE_OUTCOME_ELIGIBLE_STATUSES if status != next_status
            ),
        )
        if updated_quote is None:
            current_quote = await self._repository.get_by_id(quote_id, user_id)
            if current_quote is not None and current_quote.status == next_status:
                return current_quote
            raise QuoteServiceError(
                detail="Unable to update quote outcome",
                status_code=409,
            )

        await self._repository.commit()
        refreshed_quote = await self._repository.refresh(updated_quote)
        log_event(
            event_name,
            user_id=user_id,
            quote_id=refreshed_quote.id,
            customer_id=refreshed_quote.customer_id,
        )
        return refreshed_quote

    async def _resolve_next_customer_id(
        self,
        *,
        user_id: UUID,
        quote: Document,
        requested_customer_id: UUID | None,
        has_linked_invoice: bool,
    ) -> UUID | None:
        current_customer_id = quote.customer_id
        if requested_customer_id == current_customer_id:
            return current_customer_id

        if requested_customer_id is None:
            if current_customer_id is None:
                return None
            raise QuoteServiceError(
                detail=_CUSTOMER_CLEAR_BLOCKED_DETAIL,
                status_code=409,
            )

        customer_exists = await self._repository.customer_exists_for_user(
            user_id=user_id,
            customer_id=requested_customer_id,
        )
        if not customer_exists:
            raise QuoteServiceError(detail="Not found", status_code=404)

        if quote.status not in _CUSTOMER_REASSIGNABLE_STATUSES or has_linked_invoice:
            raise QuoteServiceError(
                detail=_CUSTOMER_CHANGE_BLOCKED_DETAIL,
                status_code=409,
            )

        return requested_customer_id

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
            LOGGER.warning("Quote logo missing in storage; omitting from PDF render")
            context.logo_data_uri = None
            return
        except Exception:  # noqa: BLE001
            LOGGER.warning("Failed to load quote logo for PDF render; omitting logo", exc_info=True)
            context.logo_data_uri = None
            return

        content_type = detect_image_content_type(logo_bytes)
        if content_type is None:
            LOGGER.warning("Quote logo bytes were invalid; omitting from PDF render")
            context.logo_data_uri = None
            return

        encoded_logo = base64.b64encode(logo_bytes).decode("ascii")
        context.logo_data_uri = f"data:{content_type};base64,{encoded_logo}"


async def _create_quote_document(
    service: QuoteService,
    *,
    user_id: UUID,
    customer_id: UUID | None,
    title: str | None,
    transcript: str,
    line_items: list[LineItemDraft],
    total_amount: float | None,
    tax_rate: float | None,
    discount_type: str | None,
    discount_value: float | None,
    deposit_amount: float | None,
    notes: str | None,
    source_type: Literal["text", "voice"],
    extraction_tier: str | None = None,
    extraction_degraded_reason_code: str | None = None,
) -> Document:
    for attempt in range(2):
        try:
            return await service._repository.create(
                user_id=user_id,
                customer_id=customer_id,
                title=title,
                transcript=transcript,
                line_items=line_items,
                total_amount=total_amount,
                tax_rate=tax_rate,
                discount_type=discount_type,
                discount_value=discount_value,
                deposit_amount=deposit_amount,
                notes=notes,
                source_type=source_type,
                extraction_tier=extraction_tier,
                extraction_degraded_reason_code=extraction_degraded_reason_code,
            )
        except IntegrityError as exc:
            await service._repository.rollback()
            if attempt == 0 and _is_doc_sequence_collision(exc):
                continue
            raise

    raise QuoteServiceError(detail="Unable to create quote", status_code=409)


def _resolve_user_id(user: User) -> UUID:
    """Resolve user id without triggering async lazy loads on detached ORM instances."""
    identity = sa_inspect(user).identity
    if identity and identity[0] is not None:
        return cast(UUID, identity[0])
    return user.id


def ensure_quote_customer_assigned(quote: Document) -> None:
    """Reject customer-dependent quote actions until a customer is assigned."""
    if quote.customer_id is None:
        raise QuoteServiceError(
            detail=_CUSTOMER_ASSIGNMENT_REQUIRED_DETAIL,
            status_code=409,
        )


def _is_doc_sequence_collision(exc: IntegrityError) -> bool:
    """Return true when IntegrityError was caused by doc-sequence uniqueness collision."""
    message = str(exc.orig)
    return "uq_documents_user_type_sequence" in message


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _build_default_invoice_due_date() -> date:
    return _utcnow().date() + timedelta(days=30)


def build_doc_number(*, doc_type: str, sequence: int) -> str:
    prefix = "I" if doc_type == "invoice" else "Q"
    return f"{prefix}-{sequence:03d}"


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


def _validate_document_pricing_for_quote(
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


def _quote_render_inputs_changed(
    *,
    quote: Document,
    update_fields: set[str],
    next_customer_id: UUID | None,
    next_line_items: Sequence[object] | None,
    next_total_amount: float | None,
    next_tax_rate: float | None,
    next_discount_type: str | None,
    next_discount_value: float | None,
    next_deposit_amount: float | None,
    next_title: str | None,
    next_notes: str | None,
) -> bool:
    return any(
        (
            quote.customer_id != next_customer_id,
            quote.title != next_title,
            quote.notes != next_notes,
            document_field_float_or_none(quote.total_amount) != next_total_amount,
            document_field_float_or_none(quote.tax_rate) != next_tax_rate,
            quote.discount_type != next_discount_type,
            document_field_float_or_none(quote.discount_value) != next_discount_value,
            document_field_float_or_none(quote.deposit_amount) != next_deposit_amount,
            "line_items" in update_fields
            and _line_item_snapshots(quote.line_items) != _line_item_snapshots(next_line_items),
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


def _merge_append_transcript(*, current_transcript: str, appended_transcript: str) -> str:
    normalized_current = current_transcript.rstrip()
    appended_entries = _extract_append_entries(appended_transcript)

    if not normalized_current:
        if not appended_entries:
            return ""
        return "Added later:\n" + "\n".join(f"- {entry}" for entry in appended_entries)

    base_transcript, existing_entries = _split_transcript_and_append_entries(normalized_current)
    merged_entries = [*existing_entries, *appended_entries]
    if not merged_entries:
        return base_transcript

    append_section = "Added later:\n" + "\n".join(f"- {entry}" for entry in merged_entries)
    if not base_transcript:
        return append_section
    return f"{base_transcript}\n\n{append_section}"


def _split_transcript_and_append_entries(current_transcript: str) -> tuple[str, list[str]]:
    matches = list(_APPEND_TRANSCRIPT_SEPARATOR_PATTERN.finditer(current_transcript))
    if not matches:
        return current_transcript, []

    base_transcript = current_transcript[: matches[0].start()].rstrip()
    entries: list[str] = []
    for index, match in enumerate(matches):
        body_start = match.end()
        body_end = (
            matches[index + 1].start() if index + 1 < len(matches) else len(current_transcript)
        )
        section_body = current_transcript[body_start:body_end]
        entries.extend(_extract_append_entries(section_body))

    return base_transcript, entries


def _extract_append_entries(transcript: str) -> list[str]:
    entries: list[str] = []
    for raw_line in transcript.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        for prefix in _APPEND_TRANSCRIPT_BULLET_PREFIXES:
            if line.startswith(prefix):
                line = line[len(prefix) :].strip()
                break
        if line:
            entries.append(line)
    return entries
