"""Quote creation and draft persistence lifecycle service."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Literal, Protocol
from uuid import UUID

from sqlalchemy.exc import IntegrityError

from app.features.quotes.errors import QuoteServiceError
from app.features.quotes.extraction_outcomes import classify_extraction_result
from app.features.quotes.models import Document
from app.features.quotes.schemas import (
    ExtractionResult,
    LineItemDraft,
    QuoteCreateRequest,
)
from app.shared.event_logger import log_event
from app.shared.pricing import (
    PricingValidationError,
    document_field_float_or_none,
    validate_document_pricing_input,
)


class QuoteCreationRepositoryProtocol(Protocol):
    """Repository behavior required by quote creation orchestration."""

    async def customer_exists_for_user(self, *, user_id: UUID, customer_id: UUID) -> bool: ...

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

    async def commit(self) -> None: ...

    async def rollback(self) -> None: ...


class QuoteCreationService:
    """Own quote creation and draft persistence behavior."""

    def __init__(self, *, repository: QuoteCreationRepositoryProtocol) -> None:
        self._repository = repository

    async def create_quote(self, *, user_id: UUID, data: QuoteCreateRequest) -> Document:
        """Create a user-owned quote and retry once on sequence collisions."""
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

        quote = await self._create_quote_document(
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
            quote = await self._create_quote_document(
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

    async def create_manual_draft(
        self,
        *,
        user_id: UUID,
        customer_id: UUID | None,
    ) -> Document:
        """Persist one blank draft quote without running extraction."""
        await self.ensure_customer_exists_for_user(
            user_id=user_id,
            customer_id=customer_id,
        )
        try:
            quote = await self._create_quote_document(
                user_id=user_id,
                customer_id=customer_id,
                title=None,
                transcript="",
                line_items=[],
                total_amount=None,
                tax_rate=None,
                discount_type=None,
                discount_value=None,
                deposit_amount=None,
                notes=None,
                source_type="text",
            )
        except QuoteServiceError:
            raise
        except Exception as exc:  # noqa: BLE001
            await self._repository.rollback()
            raise QuoteServiceError(
                detail="Unable to save manual draft right now. Please try again.",
                status_code=503,
            ) from exc

        try:
            await self._repository.commit()
        except Exception as exc:  # noqa: BLE001
            await self._repository.rollback()
            raise QuoteServiceError(
                detail="Unable to save manual draft right now. Please try again.",
                status_code=503,
            ) from exc

        return quote

    async def _create_quote_document(
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
        source_type: Literal["text", "voice"],
        extraction_tier: str | None = None,
        extraction_degraded_reason_code: str | None = None,
    ) -> Document:
        for attempt in range(2):
            try:
                return await self._repository.create(
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
                await self._repository.rollback()
                if attempt == 0 and _is_doc_sequence_collision(exc):
                    continue
                raise

        raise QuoteServiceError(detail="Unable to create quote", status_code=409)


def _is_doc_sequence_collision(exc: IntegrityError) -> bool:
    """Return true when IntegrityError was caused by doc-sequence uniqueness collision."""
    message = str(exc.orig)
    return "uq_documents_user_type_sequence" in message


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
