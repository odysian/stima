"""Quote creation and draft persistence lifecycle service."""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal, Protocol
from uuid import UUID

from sqlalchemy.exc import IntegrityError

from app.features.quotes.errors import QuoteServiceError
from app.features.quotes.extraction_outcomes import classify_extraction_result
from app.features.quotes.models import Document
from app.features.quotes.review_metadata import build_extraction_review_metadata
from app.features.quotes.schemas import (
    ExtractionResult,
    ExtractionSuggestion,
    LineItemDraft,
    PricingFieldName,
    QuoteCreateRequest,
    UnresolvedSegment,
)
from app.shared.event_logger import log_event
from app.shared.pricing import (
    PricingValidationError,
    amounts_materially_differ,
    derive_document_subtotal_from_line_items,
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
        extraction_review_metadata: dict[str, object] | None = None,
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
        seeded_notes = _seeded_notes_from_result(extraction_result)
        extracted_line_items = [
            LineItemDraft(
                description=item.description,
                details=item.details,
                price=item.price,
                flagged=item.flagged,
                flag_reason=item.flag_reason,
            )
            for item in extraction_result.line_items
        ]
        pricing_application = _resolve_initial_pricing_application(
            extraction_result=extraction_result,
            line_items=extracted_line_items,
        )
        validated_pricing = _validate_document_pricing_for_quote(
            total_amount=pricing_application.total_amount,
            line_items=extracted_line_items,
            discount_type=pricing_application.discount_type,
            discount_value=pricing_application.discount_value,
            tax_rate=pricing_application.tax_rate,
            deposit_amount=pricing_application.deposit_amount,
        )
        seeded_pricing_fields = _seeded_pricing_fields(
            extraction_result=extraction_result,
            validated_pricing=validated_pricing,
            seeded_explicit_total=pricing_application.seeded_explicit_total,
        )
        metadata_extraction_result = _apply_initial_pricing_hidden_item(
            extraction_result=extraction_result,
            hidden_explicit_total_text=pricing_application.hidden_explicit_total_text,
        )
        extraction_review_metadata = build_extraction_review_metadata(
            metadata_extraction_result,
            seeded_notes=seeded_notes is not None,
            seeded_notes_confidence=(
                extraction_result.customer_notes_suggestion.confidence
                if extraction_result.customer_notes_suggestion is not None
                else None
            ),
            seeded_notes_source=(
                extraction_result.customer_notes_suggestion.source
                if extraction_result.customer_notes_suggestion is not None
                else None
            ),
            seeded_pricing_fields=seeded_pricing_fields,
            existing_metadata=None,
        )
        try:
            quote = await self._create_quote_document(
                user_id=user_id,
                customer_id=customer_id,
                title=None,
                transcript=extraction_result.transcript,
                line_items=extracted_line_items,
                total_amount=document_field_float_or_none(validated_pricing.total_amount),
                tax_rate=document_field_float_or_none(validated_pricing.tax_rate),
                discount_type=validated_pricing.discount_type,
                discount_value=document_field_float_or_none(validated_pricing.discount_value),
                deposit_amount=document_field_float_or_none(validated_pricing.deposit_amount),
                notes=seeded_notes,
                source_type=source_type,
                extraction_tier=extraction_metadata.tier,
                extraction_degraded_reason_code=extraction_metadata.degraded_reason_code,
                extraction_review_metadata=extraction_review_metadata.model_dump(mode="json"),
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
        extraction_review_metadata: dict[str, object] | None = None,
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
                    extraction_review_metadata=extraction_review_metadata,
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


def _seeded_notes_from_result(extraction_result: ExtractionResult) -> str | None:
    suggestion = extraction_result.customer_notes_suggestion
    if suggestion is None:
        return None
    normalized = suggestion.text.strip()
    if not normalized:
        return None
    if _is_redundant_notes_suggestion(
        suggestion=suggestion,
        extraction_result=extraction_result,
    ):
        return None
    return normalized


_NOTE_TOKEN_PATTERN = re.compile(r"[a-z0-9]+")
_NOTE_STOP_WORDS = frozenset(
    {
        "a",
        "an",
        "and",
        "at",
        "for",
        "from",
        "in",
        "is",
        "it",
        "of",
        "on",
        "or",
        "the",
        "to",
        "with",
    }
)
_NOTES_PRICING_TOKENS = frozenset(
    {
        "amount",
        "cost",
        "dollar",
        "dollars",
        "price",
        "priced",
        "subtotal",
        "tax",
        "total",
    }
)
_NOTES_UNCERTAINTY_TOKENS = frozenset(
    {
        "check",
        "confirm",
        "conflict",
        "maybe",
        "unclear",
        "unknown",
        "verify",
    }
)


def _is_redundant_notes_suggestion(
    *,
    suggestion: ExtractionSuggestion,
    extraction_result: ExtractionResult,
) -> bool:
    normalized_note = _normalize_for_overlap(suggestion.text)
    if not normalized_note:
        return True

    note_tokens = _meaningful_tokens(normalized_note)
    if not note_tokens:
        return True
    if _NOTES_PRICING_TOKENS.intersection(note_tokens):
        return True

    visible_scope_chunks: list[str] = []
    for line_item in extraction_result.line_items:
        combined_line_item_text = " ".join(
            part for part in (line_item.description, line_item.details) if part
        ).strip()
        if combined_line_item_text:
            visible_scope_chunks.append(combined_line_item_text)
    if _has_substantial_overlap(
        note_text=normalized_note,
        note_tokens=note_tokens,
        candidates=visible_scope_chunks,
    ):
        return True

    unresolved_chunks = [segment.raw_text for segment in extraction_result.unresolved_segments]
    if _has_substantial_overlap(
        note_text=normalized_note,
        note_tokens=note_tokens,
        candidates=unresolved_chunks,
    ):
        return True

    if extraction_result.unresolved_segments and _NOTES_UNCERTAINTY_TOKENS.intersection(
        note_tokens
    ):
        return True
    return False


def _has_substantial_overlap(
    *,
    note_text: str,
    note_tokens: set[str],
    candidates: Sequence[str],
) -> bool:
    for candidate in candidates:
        normalized_candidate = _normalize_for_overlap(candidate)
        if not normalized_candidate:
            continue
        if note_text in normalized_candidate or normalized_candidate in note_text:
            return True

        candidate_tokens = _meaningful_tokens(normalized_candidate)
        if not candidate_tokens:
            continue
        common_tokens = note_tokens.intersection(candidate_tokens)
        if len(common_tokens) < 3:
            continue
        smaller_size = min(len(note_tokens), len(candidate_tokens))
        if smaller_size == 0:
            continue
        if len(common_tokens) / smaller_size >= 0.6:
            return True
    return False


def _normalize_for_overlap(value: str) -> str:
    return " ".join(value.strip().casefold().split())


def _meaningful_tokens(value: str) -> set[str]:
    return {
        token
        for token in _NOTE_TOKEN_PATTERN.findall(value)
        if token not in _NOTE_STOP_WORDS and len(token) > 2
    }


@dataclass(frozen=True, slots=True)
class _InitialPricingApplication:
    total_amount: float | None
    tax_rate: float | None
    discount_type: str | None
    discount_value: float | None
    deposit_amount: float | None
    seeded_explicit_total: bool
    hidden_explicit_total_text: str | None


def _resolve_initial_pricing_application(
    *,
    extraction_result: ExtractionResult,
    line_items: list[LineItemDraft],
) -> _InitialPricingApplication:
    pricing_hints = extraction_result.pricing_hints
    line_items_define_subtotal, derived_line_item_subtotal = (
        derive_document_subtotal_from_line_items(line_items)
    )
    has_reliable_priced_line_sum = (
        line_items_define_subtotal and derived_line_item_subtotal is not None
    )
    has_valid_discount_candidate = (
        pricing_hints.discount_type is not None and pricing_hints.discount_value is not None
    )
    has_tax_or_discount_candidate = (
        pricing_hints.tax_rate is not None or has_valid_discount_candidate
    )

    seeded_explicit_total = False
    hidden_explicit_total_text: str | None = None
    total_amount: float | None

    if has_reliable_priced_line_sum:
        total_amount = derived_line_item_subtotal
        if pricing_hints.explicit_total is not None and amounts_materially_differ(
            pricing_hints.explicit_total, derived_line_item_subtotal
        ):
            hidden_explicit_total_text = (
                f"Total {pricing_hints.explicit_total:g} conflicts with visible line-item subtotal "
                f"{derived_line_item_subtotal:g}."
            )
    elif pricing_hints.explicit_total is not None and not has_tax_or_discount_candidate:
        total_amount = pricing_hints.explicit_total
        seeded_explicit_total = True
    else:
        total_amount = None
        if pricing_hints.explicit_total is not None and has_tax_or_discount_candidate:
            hidden_explicit_total_text = (
                f"Total {pricing_hints.explicit_total:g} needs review because tax or discount was "
                "also captured."
            )

    # Optional pricing fields require a subtotal authority source.
    if total_amount is None:
        return _InitialPricingApplication(
            total_amount=None,
            tax_rate=None,
            discount_type=None,
            discount_value=None,
            deposit_amount=None,
            seeded_explicit_total=seeded_explicit_total,
            hidden_explicit_total_text=hidden_explicit_total_text,
        )

    return _InitialPricingApplication(
        total_amount=total_amount,
        tax_rate=pricing_hints.tax_rate,
        discount_type=pricing_hints.discount_type if has_valid_discount_candidate else None,
        discount_value=pricing_hints.discount_value if has_valid_discount_candidate else None,
        deposit_amount=pricing_hints.deposit_amount,
        seeded_explicit_total=seeded_explicit_total,
        hidden_explicit_total_text=hidden_explicit_total_text,
    )


def _apply_initial_pricing_hidden_item(
    *,
    extraction_result: ExtractionResult,
    hidden_explicit_total_text: str | None,
) -> ExtractionResult:
    if hidden_explicit_total_text is None:
        return extraction_result
    return extraction_result.model_copy(
        update={
            "unresolved_segments": [
                *extraction_result.unresolved_segments,
                UnresolvedSegment(
                    raw_text=hidden_explicit_total_text,
                    confidence="medium",
                    source="transcript_conflict",
                ),
            ]
        }
    )


def _seeded_pricing_fields(
    *,
    extraction_result: ExtractionResult,
    validated_pricing: object,
    seeded_explicit_total: bool,
) -> set[PricingFieldName]:
    pricing_hints = extraction_result.pricing_hints
    normalized_total_amount = document_field_float_or_none(
        getattr(validated_pricing, "total_amount", None)
    )
    normalized_tax_rate = document_field_float_or_none(getattr(validated_pricing, "tax_rate", None))
    normalized_discount_type = getattr(validated_pricing, "discount_type", None)
    normalized_discount_value = document_field_float_or_none(
        getattr(validated_pricing, "discount_value", None)
    )
    normalized_deposit_amount = document_field_float_or_none(
        getattr(validated_pricing, "deposit_amount", None)
    )
    seeded: set[PricingFieldName] = set()
    if (
        seeded_explicit_total
        and pricing_hints.explicit_total is not None
        and normalized_total_amount is not None
    ):
        seeded.add("explicit_total")
    if pricing_hints.deposit_amount is not None and normalized_deposit_amount is not None:
        seeded.add("deposit_amount")
    if pricing_hints.tax_rate is not None and normalized_tax_rate is not None:
        seeded.add("tax_rate")
    if (
        pricing_hints.discount_type is not None
        and pricing_hints.discount_value is not None
        and normalized_discount_type is not None
        and normalized_discount_value is not None
    ):
        seeded.add("discount")
    return seeded
