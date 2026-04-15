"""Helpers for extraction review sidecar metadata."""

from __future__ import annotations

from hashlib import sha256
from typing import Literal, cast

from app.features.quotes.schemas import (
    ExtractionResult,
    ExtractionReviewHiddenDetails,
    ExtractionReviewMetadataV1,
    ExtractionReviewState,
    ExtractionReviewUnresolvedSegment,
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

    hidden_details = ExtractionReviewHiddenDetails(
        unresolved_segments=[
            ExtractionReviewUnresolvedSegment(
                id=_deterministic_hidden_id(
                    "unresolved",
                    segment.source,
                    segment.confidence,
                    segment.raw_text,
                ),
                raw_text=segment.raw_text,
                confidence=segment.confidence,
                source=segment.source,
            )
            for segment in extraction_result.unresolved_segments
        ],
        append_suggestions=list(previous.hidden_details.append_suggestions),
        confidence_notes=list(extraction_result.confidence_notes),
    )

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


def _deterministic_hidden_id(*parts: str) -> str:
    normalized = "|".join(part.strip().casefold() for part in parts)
    digest = sha256(normalized.encode("utf-8")).hexdigest()[:16]
    return f"h:{digest}"
