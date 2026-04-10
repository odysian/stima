"""Fixture cases for manual extraction eval harness runs."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from app.features.quotes.tests.fixtures.transcripts import TRANSCRIPTS


@dataclass(frozen=True, slots=True)
class ExtractionEvalCase:
    """Declarative extraction eval fixture used by manual property checks."""

    name: str
    transcript: str
    provider_events: tuple[dict[str, Any], ...]
    expected_models: tuple[str, ...]
    expected_invocation_tier: Literal["primary", "fallback"]
    expect_total_matches_priced_sum: bool


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
    ),
)
