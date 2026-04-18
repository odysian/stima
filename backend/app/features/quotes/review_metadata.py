"""Helpers for extraction review sidecar metadata."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from hashlib import sha256
from typing import Literal, cast
from uuid import uuid4

from app.features.quotes.schemas import (
    ExtractionResult,
    ExtractionReviewActionableItem,
    ExtractionReviewHiddenDetails,
    ExtractionReviewMetadataV1,
    ExtractionReviewState,
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

    next_actionable_items = _build_actionable_items(
        extraction_result=extraction_result,
        previous_items=previous.hidden_details.items,
        previous_state=previous.hidden_detail_state,
    )
    hidden_details = ExtractionReviewHiddenDetails(items=next_actionable_items)
    current_hidden_item_ids = {item.id for item in next_actionable_items}

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


def apply_hidden_detail_lifecycle_updates(
    metadata: ExtractionReviewMetadataV1,
    *,
    dismiss_hidden_item: str | None = None,
    clear_notes_pending: bool = False,
    clear_pricing_pending: bool = False,
) -> ExtractionReviewMetadataV1:
    """Apply sidecar lifecycle/review-state mutations from PATCH operations."""
    if not any(
        (
            dismiss_hidden_item is not None,
            clear_notes_pending,
            clear_pricing_pending,
        )
    ):
        return metadata

    next_state: dict[str, HiddenItemState] = {
        item_id: value.model_copy(deep=True)
        for item_id, value in metadata.hidden_detail_state.items()
    }
    if dismiss_hidden_item is not None:
        next_state[dismiss_hidden_item] = HiddenItemState(dismissed=True)

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
) -> dict[str, HiddenItemState]:
    merged: dict[str, HiddenItemState] = {}
    for item_id in current_item_ids:
        previous = previous_state.get(item_id, HiddenItemState())
        merged[item_id] = HiddenItemState(dismissed=previous.dismissed)
    return merged


def _build_actionable_items(
    *,
    extraction_result: ExtractionResult,
    previous_items: Sequence[ExtractionReviewActionableItem],
    previous_state: Mapping[str, HiddenItemState],
) -> list[ExtractionReviewActionableItem]:
    previous_by_signature: dict[str, ExtractionReviewActionableItem] = {
        _actionable_signature(item): item for item in previous_items
    }
    deduped: dict[str, ExtractionReviewActionableItem] = {}

    for segment in extraction_result.unresolved_segments:
        candidate = ExtractionReviewActionableItem(
            id="pending",
            kind="unresolved_segment",
            field=None,
            reason=segment.source,
            confidence=segment.confidence,
            text=segment.raw_text,
        )
        signature = _actionable_signature(candidate)
        previous = previous_by_signature.get(signature)
        previous_item_state = previous_state.get(previous.id) if previous is not None else None
        deduped[signature] = candidate.model_copy(
            update={
                "id": (
                    previous.id
                    if previous is not None
                    and (previous_item_state is None or not previous_item_state.dismissed)
                    else _build_new_occurrence_id()
                )
            }
        )

    return list(deduped.values())


def _actionable_signature(item: ExtractionReviewActionableItem) -> str:
    return "|".join(
        (
            item.kind,
            item.field or "",
            item.reason or "",
            item.text.strip().casefold(),
        )
    )


def _build_new_occurrence_id() -> str:
    return f"occ:{uuid4().hex[:16]}"
