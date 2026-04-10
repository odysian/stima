"""Manual property-based extraction eval harness.

This suite is intentionally excluded from ``make backend-verify`` and can be run
manually with ``make extraction-eval`` before prompt/model changes.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import anthropic
import httpx
import pytest

from app.features.quotes.schemas import ExtractionResult
from app.features.quotes.tests.fixtures.extraction_eval_cases import (
    EXTRACTION_EVAL_CASES,
    ExtractionEvalCase,
)
from app.integrations.extraction import ExtractionIntegration
from app.shared.input_limits import CONFIDENCE_NOTES_MAX_ITEMS, DOCUMENT_LINE_ITEMS_MAX_ITEMS

pytestmark = [pytest.mark.asyncio, pytest.mark.extraction_eval]


@dataclass
class _FakeResponse:
    content: list[dict[str, Any]]


class _SequencedMessages:
    def __init__(self, outcomes: list[object]) -> None:
        self._outcomes = iter(outcomes)
        self.calls: list[dict[str, object]] = []

    async def create(self, **kwargs: object) -> object:
        self.calls.append(kwargs)
        outcome = next(self._outcomes)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


class _SequencedClient:
    def __init__(self, outcomes: list[object]) -> None:
        self.messages = _SequencedMessages(outcomes)


def _build_outcomes(case: ExtractionEvalCase) -> list[object]:
    outcomes: list[object] = []
    for event in case.provider_events:
        if event.get("error") == "rate_limit":
            request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
            outcomes.append(
                anthropic.RateLimitError(
                    "rate limited",
                    response=httpx.Response(429, request=request),
                    body=None,
                )
            )
            continue
        outcomes.append(_FakeResponse(content=[event]))
    return outcomes


def _assert_extraction_invariants(
    result: ExtractionResult,
    *,
    transcript: str,
    expect_total_matches_priced_sum: bool,
) -> None:
    assert result.transcript == transcript
    assert len(result.line_items) <= DOCUMENT_LINE_ITEMS_MAX_ITEMS
    assert len(result.confidence_notes) <= CONFIDENCE_NOTES_MAX_ITEMS
    assert all(item.description.strip() for item in result.line_items)
    if result.extraction_tier == "degraded":
        assert result.extraction_degraded_reason_code is not None
    else:
        assert result.extraction_degraded_reason_code is None

    if expect_total_matches_priced_sum and result.total is not None:
        priced_items = [item.price for item in result.line_items if item.price is not None]
        assert priced_items
        assert sum(priced_items) == pytest.approx(result.total)


async def test_extraction_eval_baseline_invariants_hold_for_primary_fixture() -> None:
    case = EXTRACTION_EVAL_CASES[0]
    client = _SequencedClient(_build_outcomes(case))
    integration = ExtractionIntegration(
        api_key="",
        model="primary-model",
        fallback_model="fallback-model",
        max_attempts=1,
        client=client,
    )

    result = await integration.extract(case.transcript)

    _assert_extraction_invariants(
        result,
        transcript=case.transcript,
        expect_total_matches_priced_sum=case.expect_total_matches_priced_sum,
    )
    assert [call["model"] for call in client.messages.calls] == list(case.expected_models)

    metadata = integration.pop_last_call_metadata()
    assert metadata is not None
    assert metadata.invocation_tier == case.expected_invocation_tier


@pytest.mark.parametrize("case", EXTRACTION_EVAL_CASES, ids=lambda case: case.name)
async def test_extraction_eval_invariants(case: ExtractionEvalCase) -> None:
    client = _SequencedClient(_build_outcomes(case))
    integration = ExtractionIntegration(
        api_key="",
        model="primary-model",
        fallback_model="fallback-model",
        max_attempts=1,
        client=client,
    )

    result = await integration.extract(case.transcript)

    _assert_extraction_invariants(
        result,
        transcript=case.transcript,
        expect_total_matches_priced_sum=case.expect_total_matches_priced_sum,
    )
    assert [call["model"] for call in client.messages.calls] == list(case.expected_models)

    metadata = integration.pop_last_call_metadata()
    assert metadata is not None
    assert metadata.invocation_tier == case.expected_invocation_tier
