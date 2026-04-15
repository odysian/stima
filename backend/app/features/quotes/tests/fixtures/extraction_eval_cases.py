"""Fixture cases for manual extraction eval harness runs."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from app.features.quotes.tests.fixtures.transcripts import TRANSCRIPTS

_SEMANTIC_EMPTY_LINE_ITEMS_BELOW_TRANSCRIPT = (
    "Clean gutters flush drains sweep roof patch fascia trim shrubs edge beds "
    "check lights and confirm work schedule."
)
_SEMANTIC_EMPTY_LINE_ITEMS_ABOVE_TRANSCRIPT = (
    "Clean gutters flush drains sweep roof patch fascia trim shrubs edge beds "
    "check lights and confirm full work schedule tomorrow morning."
)
_TYPED_LANDSCAPING_TRANSCRIPT = (
    "Install 5 yards of brown mulch at 45 per yard, edge the front beds for 80, "
    "and flush the drip line for 60. Total should be 365."
)
_VOICE_EQUIVALENT_TRANSCRIPT = (
    "Spoken capture: install five yards of brown mulch at forty-five per yard, "
    "edge the front beds for eighty, and flush the drip line for sixty. "
    "Total should be three hundred sixty-five."
)
_MIXED_VOICE_TEXT_RAW_TRANSCRIPT = (
    "Install five yards of brown mulch at forty-five per yard and edge the front beds for eighty."
)
_MIXED_VOICE_TEXT_RAW_TYPED_NOTES = (
    "Add drip-line flush for 60. Typed follow-up says skip edging on one side; "
    "confirm with customer."
)
_MIXED_VOICE_TEXT_TRANSCRIPT = (
    f"{_MIXED_VOICE_TEXT_RAW_TRANSCRIPT}\n\n{_MIXED_VOICE_TEXT_RAW_TYPED_NOTES}"
)
_APPEND_CAPTURE_TRANSCRIPT = (
    "Original capture: install two floodlights at 180 each.\n\n"
    "Added later:\n"
    "- include driveway edging for 95"
)
_EXPLICIT_PRICING_RULE_TRANSCRIPT = (
    "Patio and drainage scope: seal patio for 260 and clear drainage line for 180. "
    "Pricing notes: deposit 150, tax 6.5 percent, discount 10 percent, total 459.95."
)
_TYPED_TRANSCRIPT_CONFLICT_TRANSCRIPT = (
    "Transcript says seal patio for 260 and clear drainage line for 180. "
    "Typed note says skip drainage if the patio budget is tight."
)

_UNRESOLVED_SEGMENT_SOURCE = Literal[
    "leftover_classification",
    "typed_conflict",
    "transcript_conflict",
]


@dataclass(frozen=True, slots=True)
class ExtractionEvalCase:
    """Declarative extraction eval fixture used by manual property checks."""

    name: str
    transcript: str
    provider_events: tuple[dict[str, Any], ...]
    expected_models: tuple[str, ...]
    expected_invocation_tier: Literal["primary", "fallback"]
    expect_total_matches_priced_sum: bool
    source_type: Literal["text", "voice", "voice+text"] = "text"
    raw_typed_notes: str | None = None
    raw_transcript: str | None = None
    expect_extraction_tier: Literal["primary", "degraded"] | None = None
    expect_degraded_reason_code: str | None = None
    expect_line_item_count_min: int | None = None
    expect_line_item_count_max: int | None = None
    expect_confidence_note_substrings: tuple[str, ...] = ()
    expect_pricing_hints: dict[str, float | str | None] | None = None
    expect_unresolved_segment_sources: tuple[_UNRESOLVED_SEGMENT_SOURCE, ...] = ()
    expect_customer_notes_source: _UNRESOLVED_SEGMENT_SOURCE | None = None
    expect_all_line_items_flagged: bool | None = None
    expect_flag_reason_substrings: tuple[str, ...] = ()
    expect_repair_attempted: bool | None = None
    expect_repair_outcome: (
        Literal[
            "not_attempted",
            "repair_succeeded",
            "repair_invalid",
            "repair_request_failed",
        ]
        | None
    ) = None
    expect_repair_validation_error_count: int | None = None
    human_notes: str | None = None


EXTRACTION_EVAL_CASES: tuple[ExtractionEvalCase, ...] = (
    ExtractionEvalCase(
        name="baseline_primary_contract_invariants",
        transcript=TRANSCRIPTS["clean_with_total"],
        provider_events=(
            {
                "type": "tool_use",
                "input": {
                    "transcript": TRANSCRIPTS["clean_with_total"],
                    "line_items": [
                        {
                            "description": "Rear garage floodlights",
                            "details": "Install 2 units",
                            "price": 360,
                        },
                        {
                            "description": "Porch switch replacement",
                            "details": None,
                            "price": 75,
                        },
                    ],
                    "total": 435,
                    "confidence_notes": [],
                },
            },
        ),
        expected_models=("primary-model",),
        expected_invocation_tier="primary",
        expect_total_matches_priced_sum=True,
        expect_extraction_tier="primary",
        expect_line_item_count_min=2,
        expect_line_item_count_max=2,
        expect_repair_attempted=False,
        expect_repair_outcome="not_attempted",
        human_notes="Baseline primary extraction invariants remain stable.",
    ),
    ExtractionEvalCase(
        name="fallback_tier_after_primary_rate_limit",
        transcript=TRANSCRIPTS["fallback_tier_probe"],
        provider_events=(
            {
                "error": "rate_limit",
            },
            {
                "type": "tool_use",
                "input": {
                    "transcript": TRANSCRIPTS["fallback_tier_probe"],
                    "line_items": [
                        {
                            "description": "Replace porch lights",
                            "details": "Two fixtures",
                            "price": 120,
                        },
                        {
                            "description": "Tighten loose railing",
                            "details": None,
                            "price": 45,
                        },
                    ],
                    "total": 165,
                    "confidence_notes": [
                        "Primary model unavailable; fallback tier produced extraction output."
                    ],
                },
            },
        ),
        expected_models=("primary-model", "fallback-model"),
        expected_invocation_tier="fallback",
        expect_total_matches_priced_sum=True,
        expect_extraction_tier="primary",
        expect_line_item_count_min=2,
        expect_line_item_count_max=2,
        expect_confidence_note_substrings=("fallback tier produced extraction output",),
        expect_repair_attempted=False,
        expect_repair_outcome="not_attempted",
        human_notes="Fallback invocation should remain quote-facing primary when usable.",
    ),
    ExtractionEvalCase(
        name="typed_landscaping_capture_with_explicit_total",
        transcript=_TYPED_LANDSCAPING_TRANSCRIPT,
        provider_events=(
            {
                "type": "tool_use",
                "input": {
                    "transcript": _TYPED_LANDSCAPING_TRANSCRIPT,
                    "line_items": [
                        {
                            "description": "Brown mulch",
                            "details": "5 yards",
                            "price": 225,
                        },
                        {
                            "description": "Edge front beds",
                            "details": None,
                            "price": 80,
                        },
                        {
                            "description": "Flush drip line",
                            "details": None,
                            "price": 60,
                        },
                    ],
                    "pricing_hints": {
                        "explicit_total": 365,
                    },
                    "confidence_notes": [],
                },
            },
        ),
        expected_models=("primary-model",),
        expected_invocation_tier="primary",
        expect_total_matches_priced_sum=True,
        expect_extraction_tier="primary",
        expect_line_item_count_min=3,
        expect_line_item_count_max=3,
        expect_pricing_hints={"explicit_total": 365},
        expect_repair_attempted=False,
        expect_repair_outcome="not_attempted",
        human_notes="Typed-only landscaping capture should preserve explicit quantity math.",
    ),
    ExtractionEvalCase(
        name="voice_only_landscaping_capture_spoken_equivalent",
        transcript=_VOICE_EQUIVALENT_TRANSCRIPT,
        provider_events=(
            {
                "type": "tool_use",
                "input": {
                    "transcript": _VOICE_EQUIVALENT_TRANSCRIPT,
                    "line_items": [
                        {
                            "description": "Brown mulch",
                            "details": "5 yards",
                            "price": 225,
                        },
                        {
                            "description": "Edge front beds",
                            "details": None,
                            "price": 80,
                        },
                        {
                            "description": "Flush drip line",
                            "details": None,
                            "price": 60,
                        },
                    ],
                    "pricing_hints": {"explicit_total": 365},
                    "confidence_notes": [],
                },
            },
        ),
        expected_models=("primary-model",),
        expected_invocation_tier="primary",
        expect_total_matches_priced_sum=True,
        source_type="voice",
        raw_transcript=_VOICE_EQUIVALENT_TRANSCRIPT,
        expect_extraction_tier="primary",
        expect_line_item_count_min=3,
        expect_line_item_count_max=3,
        expect_pricing_hints={"explicit_total": 365},
        expect_repair_attempted=False,
        expect_repair_outcome="not_attempted",
        human_notes="Voice-only equivalent should retain the same pricing structure.",
    ),
    ExtractionEvalCase(
        name="mixed_voice_text_capture_with_typed_vs_transcript_conflict",
        transcript=_MIXED_VOICE_TEXT_TRANSCRIPT,
        provider_events=(
            {
                "type": "tool_use",
                "input": {
                    "transcript": _MIXED_VOICE_TEXT_TRANSCRIPT,
                    "line_items": [
                        {
                            "description": "Brown mulch",
                            "details": "5 yards",
                            "price": 225,
                        },
                        {
                            "description": "Edge front beds",
                            "details": None,
                            "price": 80,
                        },
                        {
                            "description": "Flush drip line",
                            "details": None,
                            "price": 60,
                        },
                    ],
                    "pricing_hints": {"explicit_total": 365},
                    "customer_notes_suggestion": {
                        "text": (
                            "Typed follow-up conflicts with transcript scope; "
                            "confirm edging details."
                        ),
                        "confidence": "low",
                        "source": "typed_conflict",
                    },
                    "unresolved_segments": [
                        {
                            "raw_text": "Typed follow-up says skip edging on one side.",
                            "confidence": "low",
                            "source": "typed_conflict",
                        },
                        {
                            "raw_text": "Transcript includes edging for full front beds.",
                            "confidence": "medium",
                            "source": "transcript_conflict",
                        },
                    ],
                    "confidence_notes": [
                        "Typed and transcript conflict on edging scope; "
                        "operator confirmation required."
                    ],
                },
            },
        ),
        expected_models=("primary-model",),
        expected_invocation_tier="primary",
        expect_total_matches_priced_sum=True,
        source_type="voice+text",
        raw_typed_notes=_MIXED_VOICE_TEXT_RAW_TYPED_NOTES,
        raw_transcript=_MIXED_VOICE_TEXT_RAW_TRANSCRIPT,
        expect_extraction_tier="primary",
        expect_line_item_count_min=3,
        expect_line_item_count_max=3,
        expect_confidence_note_substrings=("conflict on edging scope",),
        expect_pricing_hints={"explicit_total": 365},
        expect_unresolved_segment_sources=("typed_conflict", "transcript_conflict"),
        expect_customer_notes_source="typed_conflict",
        expect_repair_attempted=False,
        expect_repair_outcome="not_attempted",
        human_notes=(
            "Mixed capture should retain provenance and preserve typed/transcript conflicts."
        ),
    ),
    ExtractionEvalCase(
        name="append_capture_follow_up_transcript_sample",
        transcript=_APPEND_CAPTURE_TRANSCRIPT,
        provider_events=(
            {
                "type": "tool_use",
                "input": {
                    "transcript": _APPEND_CAPTURE_TRANSCRIPT,
                    "line_items": [
                        {
                            "description": "Floodlights",
                            "details": "2 units",
                            "price": 360,
                        },
                        {
                            "description": "Driveway edging",
                            "details": None,
                            "price": 95,
                        },
                    ],
                    "pricing_hints": {"explicit_total": 455},
                    "confidence_notes": [
                        "Append capture added a new line item after the initial transcript."
                    ],
                },
            },
        ),
        expected_models=("primary-model",),
        expected_invocation_tier="primary",
        expect_total_matches_priced_sum=True,
        expect_extraction_tier="primary",
        expect_line_item_count_min=2,
        expect_line_item_count_max=2,
        expect_confidence_note_substrings=("append capture added",),
        expect_pricing_hints={"explicit_total": 455},
        expect_repair_attempted=False,
        expect_repair_outcome="not_attempted",
        human_notes="Append-style transcript section should remain deterministic in eval fixtures.",
    ),
    ExtractionEvalCase(
        name="explicit_pricing_rule_fields_with_deposit_tax_discount",
        transcript=_EXPLICIT_PRICING_RULE_TRANSCRIPT,
        provider_events=(
            {
                "type": "tool_use",
                "input": {
                    "transcript": _EXPLICIT_PRICING_RULE_TRANSCRIPT,
                    "line_items": [
                        {
                            "description": "Patio sealing",
                            "details": None,
                            "price": 260,
                        },
                        {
                            "description": "Drainage line cleanout",
                            "details": None,
                            "price": 180,
                        },
                    ],
                    "pricing_hints": {
                        "explicit_total": 459.95,
                        "deposit_amount": 150,
                        "tax_rate": 6.5,
                        "discount_type": "percent",
                        "discount_value": 10,
                    },
                    "confidence_notes": [
                        "Total includes tax and discount adjustments; line-item sum may differ."
                    ],
                },
            },
        ),
        expected_models=("primary-model",),
        expected_invocation_tier="primary",
        expect_total_matches_priced_sum=False,
        expect_extraction_tier="primary",
        expect_line_item_count_min=2,
        expect_line_item_count_max=2,
        expect_pricing_hints={
            "explicit_total": 459.95,
            "deposit_amount": 150,
            "tax_rate": 6.5,
            "discount_type": "percent",
            "discount_value": 10,
        },
        expect_repair_attempted=False,
        expect_repair_outcome="not_attempted",
        human_notes="Pricing hints should retain explicit total/deposit/tax/discount fields.",
    ),
    ExtractionEvalCase(
        name="typed_vs_transcript_conflict_with_unresolved_segments",
        transcript=_TYPED_TRANSCRIPT_CONFLICT_TRANSCRIPT,
        provider_events=(
            {
                "type": "tool_use",
                "input": {
                    "transcript": _TYPED_TRANSCRIPT_CONFLICT_TRANSCRIPT,
                    "line_items": [
                        {
                            "description": "Patio sealing",
                            "details": None,
                            "price": 260,
                        },
                        {
                            "description": "Drainage line cleanout",
                            "details": None,
                            "price": 180,
                        },
                    ],
                    "pricing_hints": {"explicit_total": 440},
                    "customer_notes_suggestion": {
                        "text": "Customer may want to waive drainage cleanout if budget is tight.",
                        "confidence": "low",
                        "source": "typed_conflict",
                    },
                    "unresolved_segments": [
                        {
                            "raw_text": "Typed note says skip drainage if budget is tight.",
                            "confidence": "low",
                            "source": "typed_conflict",
                        },
                        {
                            "raw_text": "Transcript still includes drainage line cleanout.",
                            "confidence": "medium",
                            "source": "transcript_conflict",
                        },
                    ],
                    "confidence_notes": ["Typed and transcript inputs conflict on drainage scope."],
                },
            },
        ),
        expected_models=("primary-model",),
        expected_invocation_tier="primary",
        expect_total_matches_priced_sum=True,
        expect_extraction_tier="primary",
        expect_line_item_count_min=2,
        expect_line_item_count_max=2,
        expect_confidence_note_substrings=("conflict on drainage scope",),
        expect_pricing_hints={"explicit_total": 440},
        expect_unresolved_segment_sources=("typed_conflict", "transcript_conflict"),
        expect_customer_notes_source="typed_conflict",
        expect_repair_attempted=False,
        expect_repair_outcome="not_attempted",
        human_notes="Typed-vs-transcript conflict should survive as unresolved sidecar details.",
    ),
    ExtractionEvalCase(
        name="repair_succeeds_after_one_invalid_payload",
        transcript=TRANSCRIPTS["clean_with_total"],
        provider_events=(
            {
                "type": "tool_use",
                "input": {
                    "transcript": TRANSCRIPTS["clean_with_total"],
                    "line_items": "invalid-shape",
                    "total": 435,
                    "confidence_notes": [],
                },
            },
            {
                "type": "tool_use",
                "input": {
                    "transcript": TRANSCRIPTS["clean_with_total"],
                    "line_items": [
                        {
                            "description": "Trim shrubs",
                            "details": "Front beds",
                            "price": 125,
                        }
                    ],
                    "total": 125,
                    "confidence_notes": [],
                },
            },
        ),
        expected_models=("primary-model", "primary-model"),
        expected_invocation_tier="primary",
        expect_total_matches_priced_sum=True,
        expect_extraction_tier="primary",
        expect_line_item_count_min=1,
        expect_line_item_count_max=1,
        expect_repair_attempted=True,
        expect_repair_outcome="repair_succeeded",
        expect_repair_validation_error_count=1,
        human_notes="One repair turn should recover invalid initial tool output.",
    ),
    ExtractionEvalCase(
        name="repair_still_invalid_degrades_with_reason_code",
        transcript=TRANSCRIPTS["clean_with_total"],
        provider_events=(
            {
                "type": "tool_use",
                "input": {
                    "transcript": TRANSCRIPTS["clean_with_total"],
                    "line_items": "invalid-shape",
                    "total": 435,
                    "confidence_notes": [],
                },
            },
            {
                "type": "tool_use",
                "input": {
                    "transcript": TRANSCRIPTS["clean_with_total"],
                    "line_items": "still-invalid",
                    "total": 435,
                    "confidence_notes": [],
                },
            },
        ),
        expected_models=("primary-model", "primary-model"),
        expected_invocation_tier="primary",
        expect_total_matches_priced_sum=False,
        expect_extraction_tier="degraded",
        expect_degraded_reason_code="validation_repair_failed",
        expect_line_item_count_min=0,
        expect_line_item_count_max=0,
        expect_repair_attempted=True,
        expect_repair_outcome="repair_invalid",
        expect_repair_validation_error_count=1,
        human_notes="Invalid repair payload should degrade with validation repair failure.",
    ),
    ExtractionEvalCase(
        name="semantic_empty_items_below_threshold_stays_primary",
        transcript=_SEMANTIC_EMPTY_LINE_ITEMS_BELOW_TRANSCRIPT,
        provider_events=(
            {
                "type": "tool_use",
                "input": {
                    "transcript": _SEMANTIC_EMPTY_LINE_ITEMS_BELOW_TRANSCRIPT,
                    "line_items": [],
                    "total": None,
                    "confidence_notes": [],
                },
            },
        ),
        expected_models=("primary-model",),
        expected_invocation_tier="primary",
        expect_total_matches_priced_sum=False,
        expect_extraction_tier="primary",
        expect_line_item_count_min=0,
        expect_line_item_count_max=0,
        expect_repair_attempted=False,
        expect_repair_outcome="not_attempted",
        human_notes="Boundary probe just below transcript-char threshold.",
    ),
    ExtractionEvalCase(
        name="semantic_empty_items_at_or_above_threshold_degrades",
        transcript=_SEMANTIC_EMPTY_LINE_ITEMS_ABOVE_TRANSCRIPT,
        provider_events=(
            {
                "type": "tool_use",
                "input": {
                    "transcript": _SEMANTIC_EMPTY_LINE_ITEMS_ABOVE_TRANSCRIPT,
                    "line_items": [],
                    "total": None,
                    "confidence_notes": [],
                },
            },
        ),
        expected_models=("primary-model",),
        expected_invocation_tier="primary",
        expect_total_matches_priced_sum=False,
        expect_extraction_tier="degraded",
        expect_degraded_reason_code="semantic_empty_line_items_substantial_transcript",
        expect_line_item_count_min=0,
        expect_line_item_count_max=0,
        expect_confidence_note_substrings=(
            "No line items were extracted from a substantial transcript",
        ),
        expect_repair_attempted=False,
        expect_repair_outcome="not_attempted",
        human_notes="Boundary probe at/above semantic transcript + word thresholds.",
    ),
    ExtractionEvalCase(
        name="total_mismatch_transcript",
        transcript=(
            "Paint fence for 150 and replace gate latch for 100. Customer says total should be 225."
        ),
        provider_events=(
            {
                "type": "tool_use",
                "input": {
                    "transcript": (
                        "Paint fence for 150 and replace gate latch for 100. "
                        "Customer says total should be 225."
                    ),
                    "line_items": [
                        {
                            "description": "Paint fence",
                            "details": None,
                            "price": 150,
                        },
                        {
                            "description": "Replace gate latch",
                            "details": None,
                            "price": 100,
                        },
                    ],
                    "total": 225,
                    "confidence_notes": [
                        "Stated total does not match line item sum; review total before sending."
                    ],
                },
            },
        ),
        expected_models=("primary-model",),
        expected_invocation_tier="primary",
        expect_total_matches_priced_sum=True,
        expect_extraction_tier="primary",
        expect_line_item_count_min=2,
        expect_line_item_count_max=2,
        expect_confidence_note_substrings=("does not match line item sum",),
        expect_repair_attempted=False,
        expect_repair_outcome="not_attempted",
        human_notes="Total mismatch should recalculate or provide explicit mismatch guidance.",
    ),
    ExtractionEvalCase(
        name="duplicate_line_items_in_transcript",
        transcript=("Clean gutters for 150, also clean the gutters on the back for 150."),
        provider_events=(
            {
                "type": "tool_use",
                "input": {
                    "transcript": (
                        "Clean gutters for 150, also clean the gutters on the back for 150."
                    ),
                    "line_items": [
                        {
                            "description": "Clean gutters",
                            "details": "Front",
                            "price": 150,
                        },
                        {
                            "description": "Clean gutters",
                            "details": "Back",
                            "price": 150,
                        },
                    ],
                    "total": 300,
                    "confidence_notes": [],
                },
            },
        ),
        expected_models=("primary-model",),
        expected_invocation_tier="primary",
        expect_total_matches_priced_sum=True,
        expect_extraction_tier="primary",
        expect_line_item_count_min=2,
        expect_line_item_count_max=2,
        expect_all_line_items_flagged=True,
        expect_flag_reason_substrings=("duplicate",),
        expect_repair_attempted=False,
        expect_repair_outcome="not_attempted",
        human_notes="Duplicate post-validation semantic flagging should mark both entries.",
    ),
    ExtractionEvalCase(
        name="very_short_transcript",
        transcript="Mow lawn 50",
        provider_events=(
            {
                "type": "tool_use",
                "input": {
                    "transcript": "Mow lawn 50",
                    "line_items": [
                        {
                            "description": "Mow lawn",
                            "details": None,
                            "price": 50,
                        }
                    ],
                    "total": 50,
                    "confidence_notes": [],
                },
            },
        ),
        expected_models=("primary-model",),
        expected_invocation_tier="primary",
        expect_total_matches_priced_sum=True,
        expect_extraction_tier="primary",
        expect_line_item_count_min=1,
        expect_line_item_count_max=1,
        expect_repair_attempted=False,
        expect_repair_outcome="not_attempted",
        human_notes="Very short transcripts should not trip empty-items semantic degradation.",
    ),
)
