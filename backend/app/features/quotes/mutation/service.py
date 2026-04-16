"""Quote mutation lifecycle service for update behavior."""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Sequence
from datetime import UTC, date, datetime, timedelta
from typing import Protocol, cast
from uuid import UUID

from sqlalchemy.exc import IntegrityError

from app.features.quotes.errors import QuoteServiceError
from app.features.quotes.models import Document, QuoteStatus
from app.features.quotes.review_metadata import (
    apply_hidden_detail_lifecycle_updates,
    clear_append_suggestions_for_manual_edits,
    normalize_extraction_review_metadata,
)
from app.features.quotes.schemas import (
    ExtractionReviewMetadataUpdateRequest,
    ExtractionReviewMetadataV1,
    LineItemDraft,
    QuoteUpdateRequest,
)
from app.shared.event_logger import log_event
from app.shared.pricing import (
    PricingValidationError,
    derive_document_subtotal_from_line_items,
    document_field_float_or_none,
    resolve_document_subtotal_for_edit,
    validate_document_pricing_input,
)

_CUSTOMER_CLEAR_BLOCKED_DETAIL = "Customer cannot be cleared from a quote."
_CUSTOMER_CHANGE_BLOCKED_DETAIL = "Customer cannot be changed after sharing or invoice conversion."
_DOC_TYPE_CHANGE_STATUS_BLOCKED_DETAIL = (
    "Document type can only be changed in draft or ready status."
)
_DOC_TYPE_CHANGE_SHARED_BLOCKED_DETAIL = "Document type cannot be changed after sharing."
_CUSTOMER_REASSIGNABLE_STATUSES = frozenset({QuoteStatus.DRAFT, QuoteStatus.READY})
_DOC_TYPE_CHANGEABLE_STATUSES = frozenset({QuoteStatus.DRAFT, QuoteStatus.READY})


class QuoteMutationRepositoryProtocol(Protocol):
    """Repository behavior required by quote update mutation orchestration."""

    async def get_by_id(self, quote_id: UUID, user_id: UUID) -> Document | None: ...

    async def customer_exists_for_user(self, *, user_id: UUID, customer_id: UUID) -> bool: ...

    async def has_linked_invoice(
        self,
        *,
        source_document_id: UUID,
        user_id: UUID,
    ) -> bool: ...

    async def get_next_doc_sequence_for_type(self, *, user_id: UUID, doc_type: str) -> int: ...

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
        extraction_review_metadata: dict[str, object] | None = None,
        update_extraction_review_metadata: bool = False,
    ) -> Document: ...

    async def update_extraction_review_metadata(
        self,
        *,
        document: Document,
        extraction_review_metadata: dict[str, object],
    ) -> Document: ...

    async def invalidate_pdf_artifact(self, document: Document) -> str | None: ...

    async def commit(self) -> None: ...

    async def refresh(self, document: Document) -> Document: ...

    async def rollback(self) -> None: ...


class QuoteMutationService:
    """Own quote update mutation lifecycle behavior and side effects."""

    def __init__(
        self,
        *,
        repository: QuoteMutationRepositoryProtocol,
        delete_obsolete_artifact: Callable[[str | None], Awaitable[None]],
        ensure_quote_customer_assigned: Callable[[Document], None],
    ) -> None:
        self._repository = repository
        self._delete_obsolete_artifact = delete_obsolete_artifact
        self._ensure_quote_customer_assigned = ensure_quote_customer_assigned

    async def update_quote(
        self,
        *,
        user_id: UUID,
        quote_id: UUID,
        data: QuoteUpdateRequest,
    ) -> Document:
        """Patch editable quote fields and optionally replace line items."""
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
        next_total_amount = document_field_float_or_none(current_pricing.total_amount)
        next_tax_rate = document_field_float_or_none(current_pricing.tax_rate)
        next_discount_type = current_pricing.discount_type
        next_discount_value = document_field_float_or_none(current_pricing.discount_value)
        next_deposit_amount = document_field_float_or_none(current_pricing.deposit_amount)
        next_notes = data.notes if "notes" in data.model_fields_set else quote.notes
        notes_changed = "notes" in data.model_fields_set and _normalized_optional_text(
            next_notes
        ) != _normalized_optional_text(quote.notes)
        pricing_changed = any(
            (
                next_total_amount != document_field_float_or_none(quote.total_amount),
                next_tax_rate != document_field_float_or_none(quote.tax_rate),
                next_discount_type != quote.discount_type,
                next_discount_value != document_field_float_or_none(quote.discount_value),
                next_deposit_amount != document_field_float_or_none(quote.deposit_amount),
            )
        )
        next_extraction_review_metadata, update_extraction_review_metadata = (
            _resolve_next_extraction_review_metadata_for_update(
                quote=quote,
                notes_changed=notes_changed,
                pricing_changed=pricing_changed,
            )
        )
        rendered_fields_changed = (
            _quote_render_inputs_changed(
                quote=quote,
                update_fields=data.model_fields_set,
                next_customer_id=next_customer_id,
                next_line_items=next_line_items,
                next_total_amount=next_total_amount,
                next_tax_rate=next_tax_rate,
                next_discount_type=next_discount_type,
                next_discount_value=next_discount_value,
                next_deposit_amount=next_deposit_amount,
                next_title=data.title if "title" in data.model_fields_set else quote.title,
                next_notes=next_notes,
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
                total_amount=next_total_amount,
                update_total_amount="total_amount" in data.model_fields_set
                or ("line_items" in data.model_fields_set and line_items_define_subtotal)
                or "discount_type" in data.model_fields_set
                or "discount_value" in data.model_fields_set
                or "tax_rate" in data.model_fields_set,
                tax_rate=next_tax_rate,
                update_tax_rate="tax_rate" in data.model_fields_set,
                discount_type=next_discount_type,
                update_discount_type=(
                    "discount_type" in data.model_fields_set
                    or ("discount_value" in data.model_fields_set and next_discount_type is None)
                ),
                discount_value=next_discount_value,
                update_discount_value="discount_value" in data.model_fields_set,
                deposit_amount=next_deposit_amount,
                update_deposit_amount="deposit_amount" in data.model_fields_set,
                notes=data.notes,
                update_notes="notes" in data.model_fields_set,
                line_items=data.line_items,
                replace_line_items="line_items" in data.model_fields_set,
                extraction_review_metadata=(
                    next_extraction_review_metadata.model_dump(mode="json")
                    if next_extraction_review_metadata is not None
                    else None
                ),
                update_extraction_review_metadata=update_extraction_review_metadata,
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

    async def update_extraction_review_metadata(
        self,
        *,
        user_id: UUID,
        quote_id: UUID,
        data: ExtractionReviewMetadataUpdateRequest,
    ) -> ExtractionReviewMetadataV1:
        """Mutate only extraction review sidecar metadata for one quote."""
        quote = await self._repository.get_by_id(quote_id, user_id)
        if quote is None:
            raise QuoteServiceError(detail="Not found", status_code=404)

        metadata = normalize_extraction_review_metadata(
            quote.extraction_review_metadata,
            extraction_degraded_reason_code=quote.extraction_degraded_reason_code,
        )
        next_metadata = apply_hidden_detail_lifecycle_updates(
            metadata,
            dismiss_hidden_item=data.dismiss_hidden_item,
            clear_notes_pending=(
                data.clear_review_state is not None
                and data.clear_review_state.notes_pending is True
            ),
            clear_pricing_pending=(
                data.clear_review_state is not None
                and data.clear_review_state.pricing_pending is True
            ),
        )
        if next_metadata.model_dump(mode="json") != metadata.model_dump(mode="json"):
            await self._repository.update_extraction_review_metadata(
                document=quote,
                extraction_review_metadata=next_metadata.model_dump(mode="json"),
            )
            await self._repository.commit()
        return normalize_extraction_review_metadata(
            quote.extraction_review_metadata,
            extraction_degraded_reason_code=quote.extraction_degraded_reason_code,
        )

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

        self._ensure_quote_customer_assigned(quote)
        next_sequence = await self._repository.get_next_doc_sequence_for_type(
            user_id=user_id,
            doc_type="invoice",
        )
        quote.doc_type = "invoice"
        quote.extraction_tier = None
        quote.extraction_degraded_reason_code = None
        quote.doc_sequence = next_sequence
        quote.doc_number = _build_doc_number(doc_type="invoice", sequence=next_sequence)
        quote.due_date = (
            requested_due_date
            if requested_due_date is not None
            else _build_default_invoice_due_date()
        )
        return True

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


def _resolve_next_extraction_review_metadata_for_update(
    *,
    quote: Document,
    notes_changed: bool,
    pricing_changed: bool,
) -> tuple[ExtractionReviewMetadataV1 | None, bool]:
    if not notes_changed and not pricing_changed:
        return None, False

    metadata = normalize_extraction_review_metadata(
        getattr(quote, "extraction_review_metadata", None),
        extraction_degraded_reason_code=getattr(quote, "extraction_degraded_reason_code", None),
    )
    cleared_metadata = clear_append_suggestions_for_manual_edits(
        metadata,
        notes_changed=notes_changed,
        pricing_changed=pricing_changed,
    )
    if cleared_metadata.model_dump(mode="json") == metadata.model_dump(mode="json"):
        return None, False
    return cleared_metadata, True


def _normalized_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _is_doc_sequence_collision(exc: IntegrityError) -> bool:
    message = str(exc.orig)
    return "uq_documents_user_type_sequence" in message


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _build_default_invoice_due_date() -> date:
    return _utcnow().date() + timedelta(days=30)


def _build_doc_number(*, doc_type: str, sequence: int) -> str:
    prefix = "I" if doc_type == "invoice" else "Q"
    return f"{prefix}-{sequence:03d}"


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
