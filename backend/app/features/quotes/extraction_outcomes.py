"""Shared extraction outcome helpers for sync/async quote flows."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from app.features.quotes.schemas import ExtractionResult, PricingHints
from app.integrations.extraction import is_retryable_extraction_error
from app.shared.event_logger import log_event

ExtractionTier = Literal["primary", "degraded"]
ExtractionOutcome = Literal["primary", "degraded"]

EXTRACTION_TIER_PRIMARY: ExtractionTier = "primary"
EXTRACTION_TIER_DEGRADED: ExtractionTier = "degraded"
EXTRACTION_OUTCOME_PRIMARY: ExtractionOutcome = "primary"
EXTRACTION_OUTCOME_DEGRADED: ExtractionOutcome = "degraded"
DEGRADED_REASON_PROVIDER_RETRYABLE_ERROR = "provider_retryable_error"


@dataclass(frozen=True, slots=True)
class ExtractionOutcomeMetadata:
    """Normalized extraction metadata persisted on quote documents and events."""

    tier: ExtractionTier
    degraded_reason_code: str | None
    outcome: ExtractionOutcome


def classify_extraction_result(result: ExtractionResult) -> ExtractionOutcomeMetadata:
    """Normalize extraction metadata so sync and async paths share one contract."""
    if result.extraction_tier == EXTRACTION_TIER_DEGRADED:
        reason_code = (
            result.extraction_degraded_reason_code or DEGRADED_REASON_PROVIDER_RETRYABLE_ERROR
        )
        return ExtractionOutcomeMetadata(
            tier=EXTRACTION_TIER_DEGRADED,
            degraded_reason_code=reason_code,
            outcome=EXTRACTION_OUTCOME_DEGRADED,
        )
    return ExtractionOutcomeMetadata(
        tier=EXTRACTION_TIER_PRIMARY,
        degraded_reason_code=None,
        outcome=EXTRACTION_OUTCOME_PRIMARY,
    )


def build_degraded_extraction_result(
    *,
    transcript: str,
    reason_code: str = DEGRADED_REASON_PROVIDER_RETRYABLE_ERROR,
) -> ExtractionResult:
    """Build a degraded sentinel result that still preserves user transcript work."""
    return ExtractionResult(
        transcript=transcript,
        pipeline_version="v2",
        line_items=[],
        pricing_hints=PricingHints(),
        customer_notes_suggestion=None,
        unresolved_segments=[],
        confidence_notes=[],
        extraction_tier=EXTRACTION_TIER_DEGRADED,
        extraction_degraded_reason_code=reason_code,
    )


def should_persist_degraded_retryable_error(
    error: Exception,
    *,
    is_final_attempt: bool,
) -> bool:
    """Return whether this exception chain qualifies for final-attempt degraded persist."""
    if not is_final_attempt:
        return False
    return any(
        is_retryable_extraction_error(candidate) for candidate in _iter_exception_chain(error)
    )


def log_draft_generated_event(
    *,
    user_id: UUID,
    quote_id: UUID,
    customer_id: UUID | None,
    capture_detail: str,
    extraction_result: ExtractionResult,
) -> None:
    """Emit draft-generated analytics with required extraction outcome metadata."""
    metadata = classify_extraction_result(extraction_result)
    log_event(
        "draft_generated",
        user_id=user_id,
        quote_id=quote_id,
        customer_id=customer_id,
        detail=capture_detail,
        extraction_outcome=metadata.outcome,
    )


def log_draft_generation_failed_event(*, user_id: UUID, capture_detail: str) -> None:
    """Emit one draft-generation-failed analytics event."""
    log_event(
        "draft_generation_failed",
        user_id=user_id,
        detail=capture_detail,
    )


def _iter_exception_chain(error: Exception) -> list[Exception]:
    chain: list[Exception] = []
    seen_ids: set[int] = set()
    candidate: Exception | None = error
    while candidate is not None and id(candidate) not in seen_ids:
        chain.append(candidate)
        seen_ids.add(id(candidate))
        next_candidate = (
            candidate.__cause__
            if isinstance(candidate.__cause__, Exception)
            else candidate.__context__
            if isinstance(candidate.__context__, Exception)
            else None
        )
        candidate = next_candidate
    return chain
