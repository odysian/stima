"""Helpers for extraction review sidecar metadata."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from hashlib import sha256
from typing import Literal, cast

from app.features.quotes.schemas import (
    ExtractionResult,
    ExtractionReviewAppendSuggestion,
    ExtractionReviewHiddenDetails,
    ExtractionReviewMetadataV1,
    ExtractionReviewState,
    ExtractionReviewUnresolvedSegment,
    HiddenItemState,
    NotesSeededFieldMetadata,
    PlacementConfidence,
    PricingFieldName,
    PricingSeededFieldMetadata,
    PricingSeededFieldsMetadata,
    SeededFieldsMetadata,
)


def normalize_extraction_review_metadata(
    value: object | None,
    *,
    extraction_degraded_reason_code: str | None,
) -> ExtractionReviewMetadataV1:
    """Deserialize nullable sidecar payloads to safe defaults."""
    return ExtractionReviewMetadataV1.model_validate_with_defaults(
        value,
        extraction_degraded_reason_code=extraction_degraded_reason_code,
    )


def build_extraction_review_metadata(
    extraction_result: ExtractionResult,
    *,
    seeded_notes: bool,
    seeded_notes_confidence: PlacementConfidence | None,
    seeded_notes_source: str | None,
    seeded_pricing_fields: set[PricingFieldName],
    existing_metadata: ExtractionReviewMetadataV1 | None = None,
    append_suggestions: Sequence[ExtractionReviewAppendSuggestion] | None = None,
) -> ExtractionReviewMetadataV1:
    """Build or merge sidecar metadata for one extraction persistence write."""
    previous = existing_metadata or ExtractionReviewMetadataV1()
    notes_seeded_source = _normalize_notes_seeded_source(seeded_notes_source)

    notes_seeded = previous.seeded_fields.notes.seeded or seeded_notes
    notes_confidence = (
        previous.seeded_fields.notes.confidence
        if previous.seeded_fields.notes.confidence is not None
        else seeded_notes_confidence
    )
    if seeded_notes and seeded_notes_confidence is not None:
        notes_confidence = seeded_notes_confidence

    notes_source = previous.seeded_fields.notes.source
    if notes_source is None and notes_seeded_source is not None:
        notes_source = notes_seeded_source
    elif seeded_notes and notes_seeded_source is not None:
        notes_source = notes_seeded_source

    pricing_seeded = previous.seeded_fields.pricing
    merged_pricing = PricingSeededFieldsMetadata(
        explicit_total=_merge_pricing_seed(
            pricing_seeded.explicit_total,
            seed_now="explicit_total" in seeded_pricing_fields,
        ),
        deposit_amount=_merge_pricing_seed(
            pricing_seeded.deposit_amount,
            seed_now="deposit_amount" in seeded_pricing_fields,
        ),
        tax_rate=_merge_pricing_seed(
            pricing_seeded.tax_rate,
            seed_now="tax_rate" in seeded_pricing_fields,
        ),
        discount=_merge_pricing_seed(
            pricing_seeded.discount,
            seed_now="discount" in seeded_pricing_fields,
        ),
    )

    unresolved_segments = _dedupe_unresolved_segments(extraction_result)
    merged_append_suggestions, incoming_append_ids = _merge_append_suggestions(
        previous_suggestions=previous.hidden_details.append_suggestions,
        incoming_suggestions=append_suggestions or [],
    )
    hidden_details = ExtractionReviewHiddenDetails(
        unresolved_segments=unresolved_segments,
        append_suggestions=merged_append_suggestions,
        confidence_notes=(
            list(extraction_result.confidence_notes)
            if extraction_result.confidence_notes
            else list(previous.hidden_details.confidence_notes)
        ),
    )
    current_hidden_item_ids = {
        *[item.id for item in unresolved_segments],
        *[item.id for item in merged_append_suggestions],
    }
    resurfaced_hidden_item_ids = {
        *[item.id for item in unresolved_segments],
        *incoming_append_ids,
    }

    return ExtractionReviewMetadataV1(
        pipeline_version=extraction_result.pipeline_version,
        review_state=ExtractionReviewState(
            notes_pending=previous.review_state.notes_pending or seeded_notes,
            pricing_pending=(previous.review_state.pricing_pending or bool(seeded_pricing_fields)),
        ),
        seeded_fields=SeededFieldsMetadata(
            notes=NotesSeededFieldMetadata(
                seeded=notes_seeded,
                confidence=notes_confidence,
                source=notes_source,
            ),
            pricing=merged_pricing,
        ),
        hidden_details=hidden_details,
        hidden_detail_state=_build_hidden_detail_state(
            previous_state=previous.hidden_detail_state,
            current_item_ids=current_hidden_item_ids,
            resurfaced_item_ids=resurfaced_hidden_item_ids,
        ),
        extraction_degraded_reason_code=extraction_result.extraction_degraded_reason_code,
    )


def _merge_pricing_seed(
    previous: PricingSeededFieldMetadata,
    *,
    seed_now: bool,
) -> PricingSeededFieldMetadata:
    if previous.seeded or seed_now:
        return PricingSeededFieldMetadata(seeded=True, source="explicit_pricing_phrase")
    return PricingSeededFieldMetadata(seeded=False, source=previous.source)


def build_append_suggestion(
    *,
    kind: Literal["note", "pricing"],
    raw_text: str,
    confidence: Literal["medium", "low"],
    pricing_field: PricingFieldName | None = None,
) -> ExtractionReviewAppendSuggestion:
    """Build one deterministic append suggestion payload."""
    normalized_raw_text = raw_text.strip()
    suffix = pricing_field if pricing_field is not None else "none"
    return ExtractionReviewAppendSuggestion(
        id=build_hidden_item_id("append", kind, suffix, normalized_raw_text),
        kind=kind,
        raw_text=normalized_raw_text,
        confidence=confidence,
        source="append_capture",
        pricing_field=pricing_field,
    )


def clear_append_suggestions_for_manual_edits(
    metadata: ExtractionReviewMetadataV1,
    *,
    notes_changed: bool,
    pricing_changed: bool,
) -> ExtractionReviewMetadataV1:
    """Clear related append suggestions/review groups after real manual edits."""
    if not notes_changed and not pricing_changed:
        return metadata

    filtered_append_suggestions = [
        item
        for item in metadata.hidden_details.append_suggestions
        if not (
            (notes_changed and item.kind == "note") or (pricing_changed and item.kind == "pricing")
        )
    ]
    updated_review_state = metadata.review_state.model_copy(
        update={
            "notes_pending": (False if notes_changed else metadata.review_state.notes_pending),
            "pricing_pending": (
                False if pricing_changed else metadata.review_state.pricing_pending
            ),
        }
    )
    updated_hidden_details = metadata.hidden_details.model_copy(
        update={"append_suggestions": filtered_append_suggestions}
    )
    return metadata.model_copy(
        update={
            "review_state": updated_review_state,
            "hidden_details": updated_hidden_details,
        }
    )


def apply_hidden_detail_lifecycle_updates(
    metadata: ExtractionReviewMetadataV1,
    *,
    dismiss_hidden_item: str | None = None,
    review_hidden_item: str | None = None,
    clear_notes_pending: bool = False,
    clear_pricing_pending: bool = False,
) -> ExtractionReviewMetadataV1:
    """Apply sidecar lifecycle/review-state mutations from PATCH operations."""
    if not any(
        (
            dismiss_hidden_item is not None,
            review_hidden_item is not None,
            clear_notes_pending,
            clear_pricing_pending,
        )
    ):
        return metadata

    next_state: dict[str, HiddenItemState] = {
        item_id: value.model_copy(deep=True)
        for item_id, value in metadata.hidden_detail_state.items()
    }
    if review_hidden_item is not None:
        previous = next_state.get(review_hidden_item, HiddenItemState())
        next_state[review_hidden_item] = HiddenItemState(
            reviewed=True,
            dismissed=previous.dismissed,
        )
    if dismiss_hidden_item is not None:
        previous = next_state.get(dismiss_hidden_item, HiddenItemState())
        next_state[dismiss_hidden_item] = HiddenItemState(
            reviewed=previous.reviewed,
            dismissed=True,
        )

    updated_review_state = metadata.review_state.model_copy(
        update={
            "notes_pending": (
                False if clear_notes_pending else metadata.review_state.notes_pending
            ),
            "pricing_pending": (
                False if clear_pricing_pending else metadata.review_state.pricing_pending
            ),
        }
    )
    return metadata.model_copy(
        update={
            "hidden_detail_state": next_state,
            "review_state": updated_review_state,
        }
    )


def _normalize_notes_seeded_source(
    value: str | None,
) -> Literal["explicit_notes_section", "derived", "leftover_classification"] | None:
    if value in {"explicit_notes_section", "derived", "leftover_classification"}:
        return cast(
            Literal["explicit_notes_section", "derived", "leftover_classification"],
            value,
        )
    if value is None:
        return None
    return "derived"


def build_hidden_item_id(*parts: str) -> str:
    """Build a deterministic hidden-item id from normalized content parts."""
    normalized = "|".join(part.strip().casefold() for part in parts)
    digest = sha256(normalized.encode("utf-8")).hexdigest()[:16]
    return f"h:{digest}"


def _build_hidden_detail_state(
    *,
    previous_state: Mapping[str, HiddenItemState],
    current_item_ids: set[str],
    resurfaced_item_ids: set[str],
) -> dict[str, HiddenItemState]:
    merged: dict[str, HiddenItemState] = {
        item_id: state.model_copy(deep=True) for item_id, state in previous_state.items()
    }
    for item_id in current_item_ids:
        previous = merged.get(item_id, HiddenItemState())
        if item_id in resurfaced_item_ids:
            merged[item_id] = HiddenItemState()
            continue
        merged[item_id] = HiddenItemState(
            reviewed=previous.reviewed,
            dismissed=previous.dismissed,
        )
    return merged


def _dedupe_unresolved_segments(
    extraction_result: ExtractionResult,
) -> list[ExtractionReviewUnresolvedSegment]:
    deduped: dict[str, ExtractionReviewUnresolvedSegment] = {}
    for segment in extraction_result.unresolved_segments:
        hidden_id = build_hidden_item_id(
            "unresolved",
            segment.source,
            segment.confidence,
            segment.raw_text,
        )
        if hidden_id in deduped:
            continue
        deduped[hidden_id] = ExtractionReviewUnresolvedSegment(
            id=hidden_id,
            raw_text=segment.raw_text,
            confidence=segment.confidence,
            source=segment.source,
        )
    return list(deduped.values())


def _merge_append_suggestions(
    *,
    previous_suggestions: Sequence[ExtractionReviewAppendSuggestion],
    incoming_suggestions: Sequence[ExtractionReviewAppendSuggestion],
) -> tuple[list[ExtractionReviewAppendSuggestion], set[str]]:
    merged: dict[str, ExtractionReviewAppendSuggestion] = {
        item.id: item for item in previous_suggestions
    }
    incoming_ids: set[str] = set()
    for item in incoming_suggestions:
        merged[item.id] = item
        incoming_ids.add(item.id)
    return list(merged.values()), incoming_ids
