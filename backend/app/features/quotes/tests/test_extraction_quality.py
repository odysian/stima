"""Manual extraction quality eval suite against the real extraction provider."""

from __future__ import annotations

import os

import pytest

from app.core.config import get_settings
from app.features.quotes.tests.fixtures.extraction_quality_cases import QUALITY_CASES
from app.features.quotes.tests.scoring.extraction_scorer import (
    ExtractionQualityCase,
    aggregate_scores,
    format_report,
    score_case,
)
from app.integrations.extraction import ExtractionCallMetadata, ExtractionIntegration

_SETTINGS = get_settings()

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.extraction_quality,
    pytest.mark.skipif(
        not _SETTINGS.anthropic_api_key.strip(),
        reason="Extraction quality tests require ANTHROPIC_API_KEY in backend/.env",
    ),
]


def _build_integration() -> ExtractionIntegration:
    return ExtractionIntegration(
        api_key=_SETTINGS.anthropic_api_key,
        model=_SETTINGS.extraction_model,
        fallback_model=_SETTINGS.extraction_fallback_model,
        primary_prompt_variant=_SETTINGS.extraction_primary_prompt_variant,
        fallback_prompt_variant=_SETTINGS.extraction_fallback_prompt_variant,
    )


def _skip_high_cost_enabled() -> bool:
    raw_value = os.environ.get("SKIP_HIGH_COST")
    if raw_value is None:
        return False
    return raw_value.strip().casefold() not in {"", "0", "false", "no"}


def _selected_cases() -> tuple[ExtractionQualityCase, ...]:
    if not _skip_high_cost_enabled():
        return QUALITY_CASES
    return tuple(case for case in QUALITY_CASES if case.cost_tier != "high")


def _format_token_usage(metadata: ExtractionCallMetadata | None) -> str:
    if metadata is None or metadata.token_usage is None:
        return "token_usage=None"

    usage = ", ".join(f"{key}={value}" for key, value in sorted(metadata.token_usage.items()))
    model_id = metadata.model_id or "unknown"
    return f"token_usage=({usage}) tier={metadata.invocation_tier} model={model_id}"


async def test_extraction_quality_suite() -> None:
    selected_cases = _selected_cases()

    assert len(QUALITY_CASES) == 15
    assert selected_cases
    if _skip_high_cost_enabled():
        assert not any(case.name.startswith("Q12") for case in selected_cases)

    integration = _build_integration()
    scores = []

    for case in selected_cases:
        result = await integration.extract(case.transcript, mode=case.extraction_mode)
        metadata = integration.pop_last_call_metadata()

        line_item_count = len(result.line_items)
        if case.expected_line_item_count_min is not None:
            assert line_item_count >= case.expected_line_item_count_min
        if case.expected_line_item_count_max is not None:
            assert line_item_count <= case.expected_line_item_count_max

        case_score = score_case(case, result, metadata=metadata)
        scores.append(case_score)

        print(f"[{case.name}] {case.difficulty}/{case.category}")
        print(f"  {_format_token_usage(metadata)}")
        print(
            "  "
            f"overall={case_score.overall:.2f} "
            f"precision={case_score.precision:.2f} "
            f"recall={case_score.recall:.2f}"
        )

        assert 0.0 <= case_score.overall <= 1.0
        assert 0.0 <= case_score.total_score <= 1.0

    print(format_report(selected_cases, scores))
    aggregate = aggregate_scores(scores)
    print(f"Selected cases: {len(selected_cases)} / {len(QUALITY_CASES)}")
    print(f"Aggregate overall: {aggregate['overall']:.2f}")

    assert 0.0 <= aggregate["overall"] <= 1.0
