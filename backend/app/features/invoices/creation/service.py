"""Invoice creation and quote-conversion lifecycle service."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date
from typing import Protocol
from uuid import UUID

from sqlalchemy.exc import IntegrityError

from app.features.invoices.repository import build_default_due_date
from app.features.invoices.schemas import InvoiceCreateRequest
from app.features.quotes.models import Document
from app.features.quotes.schemas import LineItemDraft
from app.features.quotes.service import QuoteServiceError, ensure_quote_customer_assigned
from app.shared.event_logger import log_event
from app.shared.pricing import (
    PricingValidationError,
    document_field_float_or_none,
    validate_document_pricing_input,
)


class InvoiceCreationRepositoryProtocol(Protocol):
    """Narrow invoice repository surface used by invoice creation flows."""

    async def customer_exists_for_user(self, *, user_id: UUID, customer_id: UUID) -> bool: ...

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

    async def create_from_quote(
        self,
        *,
        source_quote: Document,
        due_date: date,
    ) -> Document: ...

    async def get_by_source_document_id(
        self,
        *,
        source_document_id: UUID,
        user_id: UUID,
    ) -> Document | None: ...

    async def commit(self) -> None: ...

    async def rollback(self) -> None: ...


class QuoteCreationSourceRepositoryProtocol(Protocol):
    """Narrow quote repository surface used by quote conversion flow."""

    async def get_by_id(self, quote_id: UUID, user_id: UUID) -> Document | None: ...


class InvoiceCreationService:
    """Own direct invoice creation and quote-to-invoice conversion behavior."""

    def __init__(
        self,
        *,
        invoice_repository: InvoiceCreationRepositoryProtocol,
        quote_repository: QuoteCreationSourceRepositoryProtocol,
    ) -> None:
        self._invoice_repository = invoice_repository
        self._quote_repository = quote_repository

    async def create_invoice(self, *, user_id: UUID, data: InvoiceCreateRequest) -> Document:
        """Create a direct invoice and retry once on sequence collisions."""
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

    async def convert_quote_to_invoice(self, *, user_id: UUID, quote_id: UUID) -> Document:
        """Create one invoice from a quote unless a linked invoice already exists."""
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
