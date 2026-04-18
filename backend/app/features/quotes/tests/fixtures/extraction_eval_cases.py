"""Fixture cases for manual extraction eval harness runs."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from app.features.quotes.schemas import ExtractionMode
from app.features.quotes.tests.fixtures.transcripts import TRANSCRIPTS

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
_APPEND_CORRECTIVE_TRANSCRIPT = (
    "Added later: actually remove driveway edging from the previous draft and keep only lights."
)
_APPEND_INCLUDED_SCOPE_TRANSCRIPT = "Added later: debris disposal is included at no extra charge."
_APPEND_CONCURRENT_TRANSCRIPT = (
    "Added later batch two: add hedge trim for 120 while another append is processing."
)
_APPEND_ASYNC_USER_EDIT_RACE_TRANSCRIPT = (
    "Added later: gate code 1942 and tax is 7 percent for this follow-up scope."
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
    extraction_mode: ExtractionMode
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
    expect_line_item_price_statuses: tuple[Literal["priced", "included", "unknown"], ...] = ()
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
        name="baseline_initial_happy_path",
        extraction_mode="initial",
        transcript=TRANSCRIPTS["clean_with_total"],
        provider_events=(
            {
                "type": "tool_use",
                "input": {
                    "line_items": [
                        {
                            "description": "Rear garage floodlights",
                            "details": "Install 2 units",
                            "price": 360,
                            "price_status": "priced",
                        },
                        {
                            "description": "Porch switch replacement",
                            "details": None,
                            "price": 75,
                            "price_status": "priced",
                        },
                    ],
                    "notes_candidate": None,
                    "pricing_candidates": {"explicit_total": 435},
                    "unresolved_items": [],
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
        human_notes=(
            "Baseline initial extraction keeps visible math aligned with visible line items."
        ),
    ),
    ExtractionEvalCase(
        name="fallback_tier_after_primary_rate_limit",
        extraction_mode="initial",
        transcript=TRANSCRIPTS["fallback_tier_probe"],
        provider_events=(
            {
                "error": "rate_limit",
            },
            {
                "type": "tool_use",
                "input": {
                    "line_items": [
                        {
                            "description": "Replace porch lights",
                            "details": "Two fixtures",
                            "price": 120,
                            "price_status": "priced",
                        },
                        {
                            "description": "Tighten loose railing",
                            "details": None,
                            "price": 45,
                            "price_status": "priced",
                        },
                    ],
                    "notes_candidate": None,
                    "pricing_candidates": {"explicit_total": 165},
                    "unresolved_items": [],
                },
            },
        ),
        expected_models=("primary-model", "fallback-model"),
        expected_invocation_tier="fallback",
        expect_total_matches_priced_sum=True,
        expect_extraction_tier="primary",
        expect_line_item_count_min=2,
        expect_line_item_count_max=2,
        expect_repair_attempted=False,
        expect_repair_outcome="not_attempted",
        human_notes="Fallback invocation remains primary-tier output when payload validates.",
    ),
    ExtractionEvalCase(
        name="typed_only_capture_with_explicit_total",
        extraction_mode="initial",
        transcript=_TYPED_LANDSCAPING_TRANSCRIPT,
        provider_events=(
            {
                "type": "tool_use",
                "input": {
                    "line_items": [
                        {
                            "description": "Brown mulch",
                            "details": "5 yards",
                            "price": 225,
                            "price_status": "priced",
                        },
                        {
                            "description": "Edge front beds",
                            "details": None,
                            "price": 80,
                            "price_status": "priced",
                        },
                        {
                            "description": "Flush drip line",
                            "details": None,
                            "price": 60,
                            "price_status": "priced",
                        },
                    ],
                    "notes_candidate": None,
                    "pricing_candidates": {"explicit_total": 365},
                    "unresolved_items": [],
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
        human_notes="Typed-only capture remains a deterministic initial-mode baseline.",
    ),
    ExtractionEvalCase(
        name="voice_only_capture_equivalent",
        extraction_mode="initial",
        transcript=_VOICE_EQUIVALENT_TRANSCRIPT,
        provider_events=(
            {
                "type": "tool_use",
                "input": {
                    "line_items": [
                        {
                            "description": "Brown mulch",
                            "details": "5 yards",
                            "price": 225,
                            "price_status": "priced",
                        },
                        {
                            "description": "Edge front beds",
                            "details": None,
                            "price": 80,
                            "price_status": "priced",
                        },
                        {
                            "description": "Flush drip line",
                            "details": None,
                            "price": 60,
                            "price_status": "priced",
                        },
                    ],
                    "notes_candidate": None,
                    "pricing_candidates": {"explicit_total": 365},
                    "unresolved_items": [],
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
        human_notes="Voice-only capture mirrors typed math and contract shape.",
    ),
    ExtractionEvalCase(
        name="mixed_voice_text_conflict_initial",
        extraction_mode="initial",
        transcript=_MIXED_VOICE_TEXT_TRANSCRIPT,
        provider_events=(
            {
                "type": "tool_use",
                "input": {
                    "line_items": [
                        {
                            "description": "Brown mulch",
                            "details": "5 yards",
                            "price": 225,
                            "price_status": "priced",
                        },
                        {
                            "description": "Edge front beds",
                            "details": None,
                            "price": 80,
                            "price_status": "priced",
                        },
                        {
                            "description": "Flush drip line",
                            "details": None,
                            "price": 60,
                            "price_status": "priced",
                        },
                    ],
                    "notes_candidate": "Typed follow-up conflicts with transcript scope.",
                    "pricing_candidates": {"explicit_total": 365},
                    "unresolved_items": [
                        {
                            "text": "Typed follow-up says skip edging on one side.",
                            "reason": "possible_conflict",
                        },
                        {
                            "text": "Transcript includes edging for full front beds.",
                            "reason": "possible_conflict",
                        },
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
        expect_pricing_hints={"explicit_total": 365},
        expect_unresolved_segment_sources=("transcript_conflict", "transcript_conflict"),
        expect_customer_notes_source="leftover_classification",
        expect_repair_attempted=False,
        expect_repair_outcome="not_attempted",
        human_notes=(
            "Mixed capture keeps source provenance and conflict details without confidence notes."
        ),
    ),
    ExtractionEvalCase(
        name="initial_pricing_fields_with_deposit_tax_discount",
        extraction_mode="initial",
        transcript=_EXPLICIT_PRICING_RULE_TRANSCRIPT,
        provider_events=(
            {
                "type": "tool_use",
                "input": {
                    "line_items": [
                        {
                            "description": "Patio sealing",
                            "details": None,
                            "price": 260,
                            "price_status": "priced",
                        },
                        {
                            "description": "Drainage line cleanout",
                            "details": None,
                            "price": 180,
                            "price_status": "priced",
                        },
                    ],
                    "notes_candidate": None,
                    "pricing_candidates": {
                        "explicit_total": 459.95,
                        "deposit_amount": 150,
                        "tax_rate": 6.5,
                        "discount_type": "percent",
                        "discount_value": 10,
                    },
                    "unresolved_items": [],
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
        human_notes=(
            "Initial mode preserves explicit pricing candidates for downstream fill-empty logic."
        ),
    ),
    ExtractionEvalCase(
        name="initial_conflicting_total_with_unknown_price_status",
        extraction_mode="initial",
        transcript=(
            "Paint fence and replace gate latch. Pricing is unclear per line item but customer "
            "says "
            "total should be 225."
        ),
        provider_events=(
            {
                "type": "tool_use",
                "input": {
                    "line_items": [
                        {
                            "description": "Paint fence",
                            "details": None,
                            "price": None,
                            "price_status": "unknown",
                        },
                        {
                            "description": "Replace gate latch",
                            "details": None,
                            "price": None,
                            "price_status": "unknown",
                        },
                    ],
                    "notes_candidate": None,
                    "pricing_candidates": {"explicit_total": 225},
                    "unresolved_items": [],
                },
            },
        ),
        expected_models=("primary-model",),
        expected_invocation_tier="primary",
        expect_total_matches_priced_sum=False,
        expect_extraction_tier="primary",
        expect_line_item_count_min=2,
        expect_line_item_count_max=2,
        expect_line_item_price_statuses=("unknown", "unknown"),
        expect_pricing_hints={"explicit_total": 225},
        expect_unresolved_segment_sources=("leftover_classification",),
        expect_repair_attempted=False,
        expect_repair_outcome="not_attempted",
        human_notes=(
            "Conflicting totals with unknown item pricing should create unresolved review guidance."
        ),
    ),
    ExtractionEvalCase(
        name="typed_vs_transcript_conflict_with_unresolved_segments",
        extraction_mode="initial",
        transcript=_TYPED_TRANSCRIPT_CONFLICT_TRANSCRIPT,
        provider_events=(
            {
                "type": "tool_use",
                "input": {
                    "line_items": [
                        {
                            "description": "Patio sealing",
                            "details": None,
                            "price": 260,
                            "price_status": "priced",
                        },
                        {
                            "description": "Drainage line cleanout",
                            "details": None,
                            "price": 180,
                            "price_status": "priced",
                        },
                    ],
                    "notes_candidate": (
                        "Customer may want to waive drainage cleanout if budget is tight."
                    ),
                    "pricing_candidates": {"explicit_total": 440},
                    "unresolved_items": [
                        {
                            "text": "Typed note says skip drainage if budget is tight.",
                            "reason": "possible_conflict",
                        },
                        {
                            "text": "Transcript still includes drainage line cleanout.",
                            "reason": "possible_conflict",
                        },
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
        expect_pricing_hints={"explicit_total": 440},
        expect_unresolved_segment_sources=("transcript_conflict", "transcript_conflict"),
        expect_customer_notes_source="leftover_classification",
        expect_repair_attempted=False,
        expect_repair_outcome="not_attempted",
        human_notes="Conflict details remain actionable via unresolved segments in 2.5.",
    ),
    ExtractionEvalCase(
        name="repair_succeeds_after_one_invalid_payload",
        extraction_mode="initial",
        transcript=TRANSCRIPTS["clean_with_total"],
        provider_events=(
            {
                "type": "tool_use",
                "input": {
                    "line_items": "invalid-shape",
                    "notes_candidate": None,
                    "pricing_candidates": {"explicit_total": 435},
                    "unresolved_items": [],
                },
            },
            {
                "type": "tool_use",
                "input": {
                    "line_items": [
                        {
                            "description": "Trim shrubs",
                            "details": "Front beds",
                            "price": 125,
                            "price_status": "priced",
                        }
                    ],
                    "notes_candidate": None,
                    "pricing_candidates": {"explicit_total": 125},
                    "unresolved_items": [],
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
        extraction_mode="initial",
        transcript=TRANSCRIPTS["clean_with_total"],
        provider_events=(
            {
                "type": "tool_use",
                "input": {
                    "line_items": "invalid-shape",
                    "notes_candidate": None,
                    "pricing_candidates": {"explicit_total": 435},
                    "unresolved_items": [],
                },
            },
            {
                "type": "tool_use",
                "input": {
                    "line_items": "still-invalid",
                    "notes_candidate": None,
                    "pricing_candidates": {"explicit_total": 435},
                    "unresolved_items": [],
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
        name="degraded_extraction_for_substantial_empty_payload",
        extraction_mode="initial",
        transcript=_SEMANTIC_EMPTY_LINE_ITEMS_ABOVE_TRANSCRIPT,
        provider_events=(
            {
                "type": "tool_use",
                "input": {
                    "line_items": [],
                    "notes_candidate": None,
                    "pricing_candidates": {},
                    "unresolved_items": [],
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
        expect_repair_attempted=False,
        expect_repair_outcome="not_attempted",
        human_notes=(
            "Substantial transcripts with empty extraction degrade without "
            "confidence-note fallback."
        ),
    ),
    ExtractionEvalCase(
        name="duplicate_line_items_are_flagged",
        extraction_mode="initial",
        transcript="Clean gutters for 150, also clean the gutters on the back for 150.",
        provider_events=(
            {
                "type": "tool_use",
                "input": {
                    "line_items": [
                        {
                            "description": "Clean gutters",
                            "details": "Front",
                            "price": 150,
                            "price_status": "priced",
                        },
                        {
                            "description": "Clean gutters",
                            "details": "Back",
                            "price": 150,
                            "price_status": "priced",
                        },
                    ],
                    "notes_candidate": None,
                    "pricing_candidates": {"explicit_total": 300},
                    "unresolved_items": [],
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
        human_notes="Duplicate semantic guard should remain visible through line-item flags.",
    ),
)
