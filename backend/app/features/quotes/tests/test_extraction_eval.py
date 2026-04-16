"""Manual property-based extraction eval harness.

This suite is intentionally excluded from ``make backend-verify`` and can be run
manually with ``make extraction-eval`` before prompt/model changes.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import anthropic
import httpx
import pytest

from app.features.quotes.schemas import ExtractionResult, PreparedCaptureInput
from app.features.quotes.tests.fixtures.extraction_eval_cases import (
    EXTRACTION_EVAL_CASES,
    ExtractionEvalCase,
)
from app.integrations.extraction import (
    APPEND_EXTRACTION_TOOL_SCHEMA,
    EXTRACTION_TOOL_SCHEMA,
    ExtractionCallMetadata,
    ExtractionError,
    ExtractionIntegration,
)
from app.shared.input_limits import (
    DOCUMENT_LINE_ITEMS_MAX_ITEMS,
)

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


def _build_capture_input(case: ExtractionEvalCase) -> PreparedCaptureInput | str:
    if case.source_type == "text" and case.raw_typed_notes is None and case.raw_transcript is None:
        return case.transcript
    if case.source_type == "voice":
        return PreparedCaptureInput(
            transcript=case.transcript,
            source_type="voice",
            raw_typed_notes=None,
            raw_transcript=case.raw_transcript or case.transcript,
        )
    if case.source_type == "voice+text":
        return PreparedCaptureInput(
            transcript=case.transcript,
            source_type="voice+text",
            raw_typed_notes=case.raw_typed_notes or case.transcript,
            raw_transcript=case.raw_transcript or case.transcript,
        )
    return PreparedCaptureInput(
        transcript=case.transcript,
        source_type="text",
        raw_typed_notes=case.raw_typed_notes or case.transcript,
        raw_transcript=None,
    )


def _assert_request_capture_provenance(
    case: ExtractionEvalCase,
    *,
    calls: list[dict[str, object]],
) -> None:
    assert calls
    messages = calls[0]["messages"]
    assert isinstance(messages, list)
    assert messages
    first_message = messages[0]
    assert isinstance(first_message, dict)
    content = first_message["content"]
    assert isinstance(content, str)
    request_payload = json.loads(content)
    assert request_payload["extraction_mode"] == case.extraction_mode
    prepared_capture_input = request_payload["prepared_capture_input"]

    assert prepared_capture_input["source_type"] == case.source_type
    assert prepared_capture_input["transcript"] == case.transcript

    tools = calls[0]["tools"]
    assert isinstance(tools, list)
    assert tools
    first_tool = tools[0]
    assert isinstance(first_tool, dict)
    input_schema = first_tool["input_schema"]
    expected_schema = (
        APPEND_EXTRACTION_TOOL_SCHEMA
        if case.extraction_mode == "append"
        else EXTRACTION_TOOL_SCHEMA
    )
    assert input_schema == expected_schema

    expected_raw_typed_notes = case.raw_typed_notes
    expected_raw_transcript = case.raw_transcript
    if case.source_type == "text":
        expected_raw_typed_notes = expected_raw_typed_notes or case.transcript
        expected_raw_transcript = None
    elif case.source_type == "voice":
        expected_raw_typed_notes = None
        expected_raw_transcript = expected_raw_transcript or case.transcript
    else:
        expected_raw_typed_notes = expected_raw_typed_notes or case.transcript
        expected_raw_transcript = expected_raw_transcript or case.transcript

    assert prepared_capture_input["raw_typed_notes"] == expected_raw_typed_notes
    assert prepared_capture_input["raw_transcript"] == expected_raw_transcript


def _assert_extraction_invariants(
    result: ExtractionResult,
    *,
    transcript: str,
    expect_total_matches_priced_sum: bool,
) -> None:
    assert result.transcript == transcript
    assert len(result.line_items) <= DOCUMENT_LINE_ITEMS_MAX_ITEMS
    assert all(item.description.strip() for item in result.line_items)
    if result.extraction_tier == "degraded":
        assert result.extraction_degraded_reason_code is not None
    else:
        assert result.extraction_degraded_reason_code is None

    if expect_total_matches_priced_sum and result.total is not None:
        priced_items = [item.price for item in result.line_items if item.price is not None]
        assert priced_items
        priced_sum = sum(priced_items)
        assert priced_sum == pytest.approx(result.total)


def _assert_extraction_quality(
    case: ExtractionEvalCase,
    result: ExtractionResult,
    *,
    metadata: ExtractionCallMetadata,
) -> None:
    if case.expect_extraction_tier is not None:
        assert result.extraction_tier == case.expect_extraction_tier

    if case.expect_degraded_reason_code is not None:
        assert result.extraction_degraded_reason_code == case.expect_degraded_reason_code

    line_item_count = len(result.line_items)
    if case.expect_line_item_count_min is not None:
        assert line_item_count >= case.expect_line_item_count_min
    if case.expect_line_item_count_max is not None:
        assert line_item_count <= case.expect_line_item_count_max

    if case.expect_pricing_hints:
        pricing_hints_payload = result.pricing_hints.model_dump(mode="json")
        for key, value in case.expect_pricing_hints.items():
            assert pricing_hints_payload[key] == value

    if case.expect_line_item_price_statuses:
        assert (
            tuple(item.price_status for item in result.line_items)
            == case.expect_line_item_price_statuses
        )

    if case.expect_unresolved_segment_sources:
        assert [segment.source for segment in result.unresolved_segments] == list(
            case.expect_unresolved_segment_sources
        )

    if case.expect_customer_notes_source is not None:
        assert result.customer_notes_suggestion is not None
        assert result.customer_notes_suggestion.source == case.expect_customer_notes_source

    if case.expect_all_line_items_flagged is not None:
        assert result.line_items
        assert all(item.flagged is case.expect_all_line_items_flagged for item in result.line_items)
    if case.expect_flag_reason_substrings:
        assert result.line_items
        for item in result.line_items:
            assert item.flag_reason is not None
            normalized_flag_reason = item.flag_reason.casefold()
            for substring in case.expect_flag_reason_substrings:
                assert substring.casefold() in normalized_flag_reason

    if case.expect_repair_attempted is not None:
        assert metadata.repair_attempted == case.expect_repair_attempted
    if case.expect_repair_outcome is not None:
        assert metadata.repair_outcome == case.expect_repair_outcome
    if case.expect_repair_validation_error_count is not None:
        assert metadata.repair_validation_error_count == case.expect_repair_validation_error_count


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

    result = await integration.extract(_build_capture_input(case), mode=case.extraction_mode)

    _assert_extraction_invariants(
        result,
        transcript=case.transcript,
        expect_total_matches_priced_sum=case.expect_total_matches_priced_sum,
    )
    assert [call["model"] for call in client.messages.calls] == list(case.expected_models)
    _assert_request_capture_provenance(case, calls=client.messages.calls)

    metadata = integration.pop_last_call_metadata()
    assert metadata is not None
    assert metadata.invocation_tier == case.expected_invocation_tier
    _assert_extraction_quality(case, result, metadata=metadata)


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

    result = await integration.extract(_build_capture_input(case), mode=case.extraction_mode)

    _assert_extraction_invariants(
        result,
        transcript=case.transcript,
        expect_total_matches_priced_sum=case.expect_total_matches_priced_sum,
    )
    assert [call["model"] for call in client.messages.calls] == list(case.expected_models)
    _assert_request_capture_provenance(case, calls=client.messages.calls)

    metadata = integration.pop_last_call_metadata()
    assert metadata is not None
    assert metadata.invocation_tier == case.expected_invocation_tier
    _assert_extraction_quality(case, result, metadata=metadata)


async def test_empty_transcript_raises_extraction_error() -> None:
    integration = ExtractionIntegration(
        api_key="",
        model="primary-model",
        fallback_model="fallback-model",
        max_attempts=1,
    )

    with pytest.raises(ExtractionError, match="notes cannot be empty"):
        await integration.extract("", mode="initial")
