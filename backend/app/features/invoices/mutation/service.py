"""Invoice mutation lifecycle service for update behavior."""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Sequence
from datetime import date
from typing import Protocol, cast
from uuid import UUID

from sqlalchemy.exc import IntegrityError

from app.features.invoices.schemas import InvoiceUpdateRequest
from app.features.quotes.models import Document, QuoteStatus
from app.features.quotes.schemas import LineItemDraft
from app.features.quotes.service import QuoteServiceError, build_doc_number
from app.shared.pricing import (
    PricingValidationError,
    derive_document_subtotal_from_line_items,
    document_field_float_or_none,
    resolve_document_subtotal_for_edit,
    validate_document_pricing_input,
)

_EDITABLE_INVOICE_STATUSES = frozenset(
    {
        QuoteStatus.DRAFT,
        QuoteStatus.READY,
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


class InvoiceMutationRepositoryProtocol(Protocol):
    """Repository behavior required by invoice update mutation orchestration."""

    async def get_by_id(self, invoice_id: UUID, user_id: UUID) -> Document | None: ...

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

    async def get_next_doc_sequence_for_type(self, *, user_id: UUID, doc_type: str) -> int: ...

    async def commit(self) -> None: ...

    async def refresh(self, invoice: Document) -> Document: ...

    async def rollback(self) -> None: ...


class InvoiceMutationService:
    """Own invoice update mutation lifecycle behavior and side effects."""

    def __init__(
        self,
        *,
        repository: InvoiceMutationRepositoryProtocol,
        delete_obsolete_artifact: Callable[[str | None], Awaitable[None]],
    ) -> None:
        self._repository = repository
        self._delete_obsolete_artifact = delete_obsolete_artifact

    async def update_invoice(
        self,
        *,
        user_id: UUID,
        invoice_id: UUID,
        data: InvoiceUpdateRequest,
    ) -> Document:
        """Patch editable invoice fields while preserving status and share continuity."""
        invoice = await self._repository.get_by_id(invoice_id, user_id)
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
            updated_invoice = await self._repository.update(
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
                obsolete_artifact_path = await self._repository.invalidate_pdf_artifact(
                    updated_invoice
                )
            await self._repository.commit()
        except IntegrityError as exc:
            await self._repository.rollback()
            if doc_type_changed_to_quote and _is_doc_sequence_collision(exc):
                raise QuoteServiceError(
                    detail="Document type change failed, please retry.",
                    status_code=409,
                ) from exc
            raise

        await self._delete_obsolete_artifact(obsolete_artifact_path)
        return await self._repository.refresh(updated_invoice)

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

        next_sequence = await self._repository.get_next_doc_sequence_for_type(
            user_id=user_id,
            doc_type="quote",
        )
        invoice.doc_type = "quote"
        invoice.doc_sequence = next_sequence
        invoice.doc_number = build_doc_number(doc_type="quote", sequence=next_sequence)
        invoice.due_date = None
        return True


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
