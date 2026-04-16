"""Quote extraction append lifecycle service."""

from __future__ import annotations

import re
from collections.abc import Awaitable, Callable, Sequence
from typing import Literal, Protocol
from uuid import UUID

from app.features.quotes.errors import QuoteServiceError
from app.features.quotes.extraction_outcomes import classify_extraction_result
from app.features.quotes.models import Document, LineItem, QuoteStatus
from app.features.quotes.price_status import (
    LineItemPriceStatus,
    resolve_line_item_price_status,
)
from app.features.quotes.review_metadata import (
    build_append_suggestion,
    build_extraction_review_metadata,
    normalize_extraction_review_metadata,
)
from app.features.quotes.schemas import (
    ExtractionResult,
    ExtractionReviewAppendSuggestion,
    LineItemDraft,
    PricingFieldName,
)
from app.shared.pricing import (
    PricingValidationError,
    derive_document_subtotal_from_line_items,
    document_field_float_or_none,
    resolve_document_subtotal_for_edit,
    validate_document_pricing_input,
)

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


def _resolve_line_item_price_status_for_append(line_item: LineItem) -> LineItemPriceStatus:
    try:
        return resolve_line_item_price_status(
            price=line_item.price,
            price_status=line_item.price_status,
            description=line_item.description,
            details=line_item.details,
        )
    except ValueError:
        return "priced" if line_item.price is not None else "unknown"


class QuoteExtractionAppendRepositoryProtocol(Protocol):
    """Repository behavior required by extraction append lifecycle orchestration."""

    async def get_by_id(self, quote_id: UUID, user_id: UUID) -> Document | None: ...

    async def append_extraction(
        self,
        *,
        document: Document,
        transcript: str,
        total_amount: float | None,
        update_total_amount: bool,
        notes: str | None,
        update_notes: bool,
        tax_rate: float | None,
        update_tax_rate: bool,
        discount_type: str | None,
        update_discount_type: bool,
        discount_value: float | None,
        update_discount_value: bool,
        deposit_amount: float | None,
        update_deposit_amount: bool,
        line_items: list[LineItemDraft],
        extraction_tier: str | None = None,
        extraction_degraded_reason_code: str | None = None,
        extraction_review_metadata: dict[str, object] | None = None,
    ) -> Document: ...

    async def invalidate_pdf_artifact(self, document: Document) -> str | None: ...

    async def commit(self) -> None: ...

    async def refresh(self, document: Document) -> Document: ...


class QuoteExtractionAppendService:
    """Own extraction append lifecycle behavior for existing quotes."""

    def __init__(
        self,
        *,
        repository: QuoteExtractionAppendRepositoryProtocol,
        delete_obsolete_artifact: Callable[[str | None], Awaitable[None]],
    ) -> None:
        self._repository = repository
        self._delete_obsolete_artifact = delete_obsolete_artifact

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
        """Append extraction output and commit cleanup only when `commit=True`."""
        quote = await self.ensure_quote_appendable(user_id=user_id, quote_id=quote_id)
        append_suggestions = _resolve_append_suggestions(
            quote=quote,
            extraction_result=extraction_result,
        )
        (
            next_notes,
            update_notes,
        ) = _resolve_next_notes_for_append(quote=quote, extraction_result=extraction_result)
        (
            next_discount_type,
            next_discount_value,
            update_discount_type,
            update_discount_value,
            seeded_discount,
        ) = _resolve_discount_for_append(quote=quote, extraction_result=extraction_result)
        (
            next_tax_rate,
            update_tax_rate,
            seeded_tax_rate,
        ) = _resolve_tax_rate_for_append(quote=quote, extraction_result=extraction_result)
        (
            next_deposit_amount,
            update_deposit_amount,
            seeded_deposit_amount,
        ) = _resolve_deposit_amount_for_append(quote=quote, extraction_result=extraction_result)
        appended_line_items = [
            LineItemDraft(
                description=item.description,
                details=item.details,
                price=item.price,
                price_status=item.price_status,
                flagged=item.flagged,
                flag_reason=item.flag_reason,
            )
            for item in extraction_result.line_items
        ]
        merged_line_items = [
            *[
                LineItemDraft(
                    description=line_item.description,
                    details=line_item.details,
                    price=document_field_float_or_none(line_item.price),
                    price_status=_resolve_line_item_price_status_for_append(line_item),
                    flagged=line_item.flagged,
                    flag_reason=line_item.flag_reason,
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
            discount_type=next_discount_type,
            discount_value=next_discount_value,
            tax_rate=next_tax_rate,
            deposit_amount=next_deposit_amount,
            line_items=merged_line_items,
        )
        next_total_input = _resolve_total_amount_for_append(
            quote=quote,
            extraction_result=extraction_result,
            line_items_define_subtotal=line_items_define_subtotal,
            derived_line_item_subtotal=derived_line_item_subtotal,
            current_subtotal=current_subtotal,
        )
        validated_pricing = _validate_document_pricing_for_append(
            total_amount=next_total_input,
            line_items=merged_line_items,
            discount_type=next_discount_type,
            discount_value=next_discount_value,
            tax_rate=next_tax_rate,
            deposit_amount=next_deposit_amount,
        )

        next_transcript = _merge_append_transcript(
            current_transcript=quote.transcript,
            appended_transcript=extraction_result.transcript,
        )
        validated_total_amount = document_field_float_or_none(validated_pricing.total_amount)
        validated_tax_rate = document_field_float_or_none(validated_pricing.tax_rate)
        validated_discount_value = document_field_float_or_none(validated_pricing.discount_value)
        validated_deposit_amount = document_field_float_or_none(validated_pricing.deposit_amount)
        seeded_pricing_fields: set[PricingFieldName] = set()
        if (
            seeded_discount
            and validated_pricing.discount_type is not None
            and validated_discount_value is not None
        ):
            seeded_pricing_fields.add("discount")
        if seeded_tax_rate and validated_tax_rate is not None:
            seeded_pricing_fields.add("tax_rate")
        if seeded_deposit_amount and validated_deposit_amount is not None:
            seeded_pricing_fields.add("deposit_amount")
        if (
            extraction_result.pricing_hints.explicit_total is not None
            and quote.total_amount is None
            and not line_items_define_subtotal
            and validated_total_amount is not None
        ):
            seeded_pricing_fields.add("explicit_total")

        extraction_metadata = classify_extraction_result(extraction_result)
        merged_review_metadata = build_extraction_review_metadata(
            extraction_result,
            seeded_notes=update_notes,
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
            existing_metadata=normalize_extraction_review_metadata(
                quote.extraction_review_metadata,
                extraction_degraded_reason_code=quote.extraction_degraded_reason_code,
            ),
            append_suggestions=append_suggestions,
        )
        updated_quote = await self._repository.append_extraction(
            document=quote,
            transcript=next_transcript,
            total_amount=validated_total_amount,
            update_total_amount=(
                validated_total_amount != document_field_float_or_none(quote.total_amount)
            ),
            notes=next_notes,
            update_notes=update_notes,
            tax_rate=validated_tax_rate,
            update_tax_rate=(
                update_tax_rate
                and validated_tax_rate != document_field_float_or_none(quote.tax_rate)
            ),
            discount_type=validated_pricing.discount_type,
            update_discount_type=(
                update_discount_type and validated_pricing.discount_type != quote.discount_type
            ),
            discount_value=validated_discount_value,
            update_discount_value=(
                update_discount_value
                and validated_discount_value != document_field_float_or_none(quote.discount_value)
            ),
            deposit_amount=validated_deposit_amount,
            update_deposit_amount=(
                update_deposit_amount
                and validated_deposit_amount != document_field_float_or_none(quote.deposit_amount)
            ),
            line_items=appended_line_items,
            extraction_tier=extraction_metadata.tier,
            extraction_degraded_reason_code=extraction_metadata.degraded_reason_code,
            extraction_review_metadata=merged_review_metadata.model_dump(mode="json"),
        )
        obsolete_artifact_path = await self._repository.invalidate_pdf_artifact(updated_quote)
        if not commit:
            return updated_quote, extraction_result

        await self._repository.commit()
        await self._delete_obsolete_artifact(obsolete_artifact_path)
        return await self._repository.refresh(updated_quote), extraction_result


def _validate_document_pricing_for_append(
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


def _resolve_append_suggestions(
    *,
    quote: Document,
    extraction_result: ExtractionResult,
) -> list[ExtractionReviewAppendSuggestion]:
    append_suggestions: list[ExtractionReviewAppendSuggestion] = []
    notes_suggestion = extraction_result.customer_notes_suggestion
    if notes_suggestion is not None and _is_populated_text(quote.notes):
        normalized_text = notes_suggestion.text.strip()
        if normalized_text:
            append_suggestions.append(
                build_append_suggestion(
                    kind="note",
                    raw_text=normalized_text,
                    confidence=_normalize_append_confidence(notes_suggestion.confidence),
                )
            )

    pricing_hints = extraction_result.pricing_hints
    if pricing_hints.explicit_total is not None and quote.total_amount is not None:
        append_suggestions.append(
            _build_pricing_append_suggestion(
                pricing_field="explicit_total",
                value=pricing_hints.explicit_total,
            )
        )
    if pricing_hints.deposit_amount is not None and quote.deposit_amount is not None:
        append_suggestions.append(
            _build_pricing_append_suggestion(
                pricing_field="deposit_amount",
                value=pricing_hints.deposit_amount,
            )
        )
    if pricing_hints.tax_rate is not None and quote.tax_rate is not None:
        append_suggestions.append(
            _build_pricing_append_suggestion(
                pricing_field="tax_rate",
                value=pricing_hints.tax_rate,
            )
        )
    if (
        pricing_hints.discount_type is not None
        and pricing_hints.discount_value is not None
        and _is_discount_populated(
            discount_type=quote.discount_type,
            discount_value=document_field_float_or_none(quote.discount_value),
        )
    ):
        append_suggestions.append(
            build_append_suggestion(
                kind="pricing",
                raw_text=(
                    f"Discount ({pricing_hints.discount_type}) {pricing_hints.discount_value:g}"
                ),
                confidence="medium",
                pricing_field="discount",
            )
        )

    return append_suggestions


def _resolve_next_notes_for_append(
    *,
    quote: Document,
    extraction_result: ExtractionResult,
) -> tuple[str | None, bool]:
    suggestion = extraction_result.customer_notes_suggestion
    if suggestion is None:
        return quote.notes, False
    normalized_text = suggestion.text.strip()
    if not normalized_text or _is_populated_text(quote.notes):
        return quote.notes, False
    return normalized_text, normalized_text != (quote.notes or "")


def _resolve_discount_for_append(
    *,
    quote: Document,
    extraction_result: ExtractionResult,
) -> tuple[str | None, float | None, bool, bool, bool]:
    discount_type = extraction_result.pricing_hints.discount_type
    discount_value = extraction_result.pricing_hints.discount_value
    if discount_type is None or discount_value is None:
        return (
            quote.discount_type,
            document_field_float_or_none(quote.discount_value),
            False,
            False,
            False,
        )
    if _is_discount_populated(
        discount_type=quote.discount_type,
        discount_value=document_field_float_or_none(quote.discount_value),
    ):
        return (
            quote.discount_type,
            document_field_float_or_none(quote.discount_value),
            False,
            False,
            False,
        )
    return discount_type, discount_value, True, True, True


def _resolve_tax_rate_for_append(
    *,
    quote: Document,
    extraction_result: ExtractionResult,
) -> tuple[float | None, bool, bool]:
    if extraction_result.pricing_hints.tax_rate is None or quote.tax_rate is not None:
        return document_field_float_or_none(quote.tax_rate), False, False
    return extraction_result.pricing_hints.tax_rate, True, True


def _resolve_deposit_amount_for_append(
    *,
    quote: Document,
    extraction_result: ExtractionResult,
) -> tuple[float | None, bool, bool]:
    if extraction_result.pricing_hints.deposit_amount is None or quote.deposit_amount is not None:
        return document_field_float_or_none(quote.deposit_amount), False, False
    return extraction_result.pricing_hints.deposit_amount, True, True


def _resolve_total_amount_for_append(
    *,
    quote: Document,
    extraction_result: ExtractionResult,
    line_items_define_subtotal: bool,
    derived_line_item_subtotal: float | None,
    current_subtotal: float | None,
) -> float | None:
    if line_items_define_subtotal:
        return derived_line_item_subtotal
    if quote.total_amount is None and extraction_result.pricing_hints.explicit_total is not None:
        return extraction_result.pricing_hints.explicit_total
    return current_subtotal


def _is_populated_text(value: str | None) -> bool:
    return value is not None and value.strip() != ""


def _is_discount_populated(
    *,
    discount_type: str | None,
    discount_value: float | None,
) -> bool:
    return discount_type is not None or discount_value is not None


def _build_pricing_append_suggestion(
    *,
    pricing_field: PricingFieldName,
    value: float,
) -> ExtractionReviewAppendSuggestion:
    label = {
        "explicit_total": "Total",
        "deposit_amount": "Deposit",
        "tax_rate": "Tax rate",
        "discount": "Discount",
    }[pricing_field]
    return build_append_suggestion(
        kind="pricing",
        raw_text=f"{label} {value:g}",
        confidence="medium",
        pricing_field=pricing_field,
    )


def _normalize_append_confidence(
    confidence: str,
) -> Literal["medium", "low"]:
    if confidence == "low":
        return "low"
    return "medium"
