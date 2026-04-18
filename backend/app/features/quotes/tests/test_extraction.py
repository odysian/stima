"""Extraction integration behavior tests with mocked Claude client responses."""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import anthropic
import httpx
import pytest

import app.integrations.extraction as extraction_module
from app.features.quotes.review_metadata import build_hidden_item_id
from app.features.quotes.schemas import PreparedCaptureInput
from app.features.quotes.tests.fixtures.transcripts import TRANSCRIPTS
from app.integrations.extraction import (
    EXTRACTION_TOOL_SCHEMA,
    SEMANTIC_DEGRADED_REASON_EMPTY_LINE_ITEMS_SUBSTANTIAL_TRANSCRIPT,
    ExtractionError,
    ExtractionIntegration,
)

pytestmark = pytest.mark.asyncio


@dataclass
class _FakeResponse:
    content: list[dict[str, Any]]


class _FakeMessages:
    def __init__(self, factory: Callable[[dict[str, object]], _FakeResponse]) -> None:
        self._factory = factory
        self.calls: list[dict[str, object]] = []

    async def create(self, **kwargs: object) -> _FakeResponse:
        self.calls.append(kwargs)
        return self._factory(kwargs)


class _FakeClient:
    def __init__(self, factory: Callable[[dict[str, object]], _FakeResponse]) -> None:
        self.messages = _FakeMessages(factory)


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


async def test_extract_keeps_null_prices_without_zero_fill() -> None:
    transcript = TRANSCRIPTS["clean_no_prices"]
    client = _FakeClient(
        lambda _: _FakeResponse(
            content=[
                {
                    "type": "tool_use",
                    "input": {
                        "transcript": transcript,
                        "line_items": [
                            {
                                "description": "Trim shrubs",
                                "details": "Front and side",
                                "price": None,
                                "price_status": "unknown",
                            },
                            {
                                "description": "Bag leaves",
                                "details": None,
                                "price": None,
                                "price_status": "unknown",
                            },
                        ],
                        "total": None,
                    },
                }
            ]
        )
    )
    integration = ExtractionIntegration(api_key="test", model="test-model", client=client)

    result = await integration.extract(transcript)

    assert result.total is None
    assert len(result.line_items) == 2
    assert all(item.price is None for item in result.line_items)


async def test_extract_preserves_total_only_payload() -> None:
    transcript = TRANSCRIPTS["total_only"]
    client = _FakeClient(
        lambda _: _FakeResponse(
            content=[
                {
                    "type": "tool_use",
                    "input": {
                        "transcript": transcript,
                        "line_items": [
                            {
                                "description": "Driveway repair and reseal",
                                "details": None,
                                "price": None,
                                "price_status": "unknown",
                            }
                        ],
                        "pricing_hints": {"explicit_total": 2100},
                    },
                }
            ]
        )
    )
    integration = ExtractionIntegration(api_key="test", model="test-model", client=client)

    result = await integration.extract(transcript)

    assert result.total == 2100
    assert result.line_items[0].price is None


async def test_extract_handles_ambiguous_partial_input_without_raising() -> None:
    transcript = TRANSCRIPTS["partial_ambiguous"]
    client = _FakeClient(
        lambda _: _FakeResponse(
            content=[
                {
                    "type": "tool_use",
                    "input": {
                        "transcript": transcript,
                        "line_items": [
                            {
                                "description": "Power wash deck",
                                "details": None,
                                "price": 225,
                                "price_status": "priced",
                            },
                            {
                                "description": "Power wash siding",
                                "details": "Normal rate not provided",
                                "price": None,
                                "price_status": "unknown",
                            },
                        ],
                        "total": None,
                    },
                }
            ]
        )
    )
    integration = ExtractionIntegration(api_key="test", model="test-model", client=client)

    result = await integration.extract(transcript)

    assert result.line_items
    assert result.line_items[0].description == "Power wash deck"


async def test_extract_preserves_price_status_from_initial_candidate() -> None:
    transcript = TRANSCRIPTS["clean_no_prices"]
    client = _FakeClient(
        lambda _: _FakeResponse(
            content=[
                {
                    "type": "tool_use",
                    "input": {
                        "line_items": [
                            {
                                "description": "Cleanup labor",
                                "details": "No separate charge",
                                "price": None,
                                "price_status": "included",
                            },
                            {
                                "description": "Gutter downspout extension",
                                "details": "Need onsite measurement",
                                "price": None,
                                "price_status": "unknown",
                            },
                        ],
                        "notes_candidate": None,
                        "pricing_candidates": {},
                        "unresolved_items": [],
                    },
                }
            ]
        )
    )
    integration = ExtractionIntegration(api_key="test", model="test-model", client=client)

    result = await integration.extract(transcript, mode="initial")

    assert [item.price_status for item in result.line_items] == ["included", "unknown"]
    assert all(item.price is None for item in result.line_items)


async def test_extract_returns_degraded_result_when_repair_is_still_invalid() -> None:
    transcript = TRANSCRIPTS["clean_with_total"]
    client = _SequencedClient(
        [
            _FakeResponse(
                content=[
                    {
                        "type": "tool_use",
                        "input": {
                            "transcript": transcript,
                            "line_items": "invalid-shape",
                            "total": 435,
                        },
                    }
                ]
            ),
            _FakeResponse(
                content=[
                    {
                        "type": "tool_use",
                        "input": {
                            "transcript": transcript,
                            "line_items": "still-invalid",
                            "total": 435,
                        },
                    }
                ]
            ),
        ]
    )
    integration = ExtractionIntegration(api_key="test", model="test-model", client=client)

    result = await integration.extract(transcript)

    assert result.extraction_tier == "degraded"
    assert result.extraction_degraded_reason_code == "validation_repair_failed"
    assert result.line_items == []
    assert len(client.messages.calls) == 2


async def test_extract_attempts_one_repair_then_accepts_valid_repaired_payload() -> None:
    transcript = TRANSCRIPTS["clean_with_total"]
    client = _SequencedClient(
        [
            _FakeResponse(
                content=[
                    {
                        "type": "tool_use",
                        "input": {
                            "transcript": transcript,
                            "line_items": "invalid-shape",
                            "total": 435,
                        },
                    }
                ]
            ),
            _FakeResponse(
                content=[
                    {
                        "type": "tool_use",
                        "input": {
                            "transcript": transcript,
                            "line_items": [
                                {
                                    "description": "Trim shrubs",
                                    "details": "Front beds",
                                    "price": 125,
                                    "price_status": "priced",
                                }
                            ],
                            "pricing_hints": {"explicit_total": 125},
                        },
                    }
                ]
            ),
        ]
    )
    integration = ExtractionIntegration(api_key="test", model="test-model", client=client)

    result = await integration.extract(transcript)

    assert len(client.messages.calls) == 2
    assert result.extraction_tier == "primary"
    assert result.total == 125
    assert result.line_items[0].description == "Trim shrubs"

    repair_messages = client.messages.calls[1]["messages"]
    assert isinstance(repair_messages, list)
    assert repair_messages
    repair_user_content = repair_messages[0]["content"]
    assert isinstance(repair_user_content, str)
    assert "Schema validation errors:" in repair_user_content


async def test_extract_sets_repair_failure_metadata_when_repair_request_errors() -> None:
    transcript = TRANSCRIPTS["clean_with_total"]
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    rate_limit_error = anthropic.RateLimitError(
        "rate limited",
        response=httpx.Response(429, request=request),
        body=None,
    )
    client = _SequencedClient(
        [
            _FakeResponse(
                content=[
                    {
                        "type": "tool_use",
                        "input": {
                            "transcript": transcript,
                            "line_items": "invalid-shape",
                            "total": 435,
                        },
                    }
                ]
            ),
            rate_limit_error,
        ]
    )
    integration = ExtractionIntegration(
        api_key="test",
        model="test-model",
        max_attempts=1,
        client=client,
    )

    with pytest.raises(ExtractionError, match="Claude request failed"):
        await integration.extract(transcript)

    metadata = integration.pop_last_call_metadata()
    assert metadata is not None
    assert metadata.repair_attempted is True
    assert metadata.repair_outcome == "repair_request_failed"
    assert metadata.repair_validation_error_count == 1
    assert len(client.messages.calls) == 2


async def test_extract_builds_client_with_configured_timeout_and_disabled_sdk_retries(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured_kwargs: dict[str, object] = {}
    transcript = TRANSCRIPTS["clean_with_total"]

    class _FakeAnthropicClient:
        def __init__(self, **kwargs: object) -> None:
            captured_kwargs.update(kwargs)
            self.messages = _FakeMessages(
                lambda _: _FakeResponse(
                    content=[
                        {
                            "type": "tool_use",
                            "input": {
                                "transcript": transcript,
                                "line_items": [],
                            },
                        }
                    ]
                )
            )

    monkeypatch.setattr("app.integrations.extraction.AsyncAnthropic", _FakeAnthropicClient)
    integration = ExtractionIntegration(
        api_key="test",
        model="test-model",
        timeout_seconds=17.5,
    )

    await integration.extract(transcript)

    assert captured_kwargs["timeout"] == 17.5
    assert captured_kwargs["max_retries"] == 0


async def test_extract_retries_rate_limit_then_succeeds(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.integrations.extraction.secrets.randbelow", lambda *_: 0)
    sleep_calls: list[float] = []

    async def _fake_sleep(delay: float) -> None:
        sleep_calls.append(delay)

    monkeypatch.setattr("app.integrations.extraction.asyncio.sleep", _fake_sleep)
    transcript = TRANSCRIPTS["clean_with_total"]
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    rate_limit_error = anthropic.RateLimitError(
        "rate limited",
        response=httpx.Response(429, request=request),
        body=None,
    )
    client = _SequencedClient(
        [
            rate_limit_error,
            _FakeResponse(
                content=[
                    {
                        "type": "tool_use",
                        "input": {
                            "transcript": transcript,
                            "line_items": [],
                        },
                    }
                ]
            ),
        ]
    )
    integration = ExtractionIntegration(
        api_key="test",
        model="test-model",
        max_attempts=2,
        client=client,
    )

    result = await integration.extract(transcript)

    assert result.transcript == transcript
    assert len(client.messages.calls) == 2
    assert sleep_calls == [0.25]


async def test_extract_does_not_invoke_fallback_before_primary_exhaustion() -> None:
    transcript = TRANSCRIPTS["clean_with_total"]
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    rate_limit_error = anthropic.RateLimitError(
        "rate limited",
        response=httpx.Response(429, request=request),
        body=None,
    )
    client = _SequencedClient(
        [
            rate_limit_error,
            _FakeResponse(
                content=[
                    {
                        "type": "tool_use",
                        "input": {
                            "transcript": transcript,
                            "line_items": [],
                        },
                    }
                ]
            ),
        ]
    )
    integration = ExtractionIntegration(
        api_key="test",
        model="primary-model",
        fallback_model="fallback-model",
        max_attempts=2,
        client=client,
    )

    await integration.extract(transcript)

    assert [call["model"] for call in client.messages.calls] == ["primary-model", "primary-model"]


async def test_extract_invokes_fallback_after_primary_exhaustion_and_tags_metadata() -> None:
    transcript = TRANSCRIPTS["clean_with_total"]
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    rate_limit_error = anthropic.RateLimitError(
        "rate limited",
        response=httpx.Response(429, request=request),
        body=None,
    )
    client = _SequencedClient(
        [
            rate_limit_error,
            _FakeResponse(
                content=[
                    {
                        "type": "tool_use",
                        "input": {
                            "transcript": transcript,
                            "line_items": [],
                        },
                    }
                ]
            ),
        ]
    )
    integration = ExtractionIntegration(
        api_key="test",
        model="primary-model",
        fallback_model="fallback-model",
        max_attempts=1,
        client=client,
    )

    result = await integration.extract(transcript)

    assert result.transcript == transcript
    assert [call["model"] for call in client.messages.calls] == ["primary-model", "fallback-model"]

    metadata = integration.pop_last_call_metadata()
    assert metadata is not None
    assert metadata.invocation_tier == "fallback"
    assert metadata.model_id == "fallback-model"
    assert metadata.prompt_variant == "fallback_default"


async def test_extract_does_not_retry_non_retryable_provider_status() -> None:
    transcript = TRANSCRIPTS["clean_with_total"]
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    bad_request_error = anthropic.APIStatusError(
        "bad request",
        response=httpx.Response(400, request=request),
        body=None,
    )
    client = _SequencedClient([bad_request_error])
    integration = ExtractionIntegration(
        api_key="test",
        model="test-model",
        max_attempts=3,
        client=client,
    )

    with pytest.raises(ExtractionError, match="Claude request failed"):
        await integration.extract(transcript)

    assert len(client.messages.calls) == 1


async def test_extract_accepts_flagged_line_items_with_reason() -> None:
    transcript = TRANSCRIPTS["partial_ambiguous"]
    client = _FakeClient(
        lambda _: _FakeResponse(
            content=[
                {
                    "type": "tool_use",
                    "input": {
                        "transcript": transcript,
                        "line_items": [
                            {
                                "description": "Siding wash",
                                "details": "1 side wall",
                                "price": 9000,
                                "price_status": "priced",
                                "flagged": True,
                                "flag_reason": (
                                    "Price seems implausibly high for a single side wall"
                                ),
                            }
                        ],
                        "total": 9000,
                    },
                }
            ]
        )
    )
    integration = ExtractionIntegration(api_key="test", model="test-model", client=client)

    result = await integration.extract(transcript)

    assert result.line_items[0].flagged is True
    assert result.line_items[0].flag_reason is not None


async def test_extract_defaults_flag_fields_when_omitted() -> None:
    transcript = TRANSCRIPTS["clean_with_total"]
    client = _FakeClient(
        lambda _: _FakeResponse(
            content=[
                {
                    "type": "tool_use",
                    "input": {
                        "transcript": transcript,
                        "line_items": [
                            {
                                "description": "Spread mulch",
                                "details": "5 yards",
                                "price": 350,
                                "price_status": "priced",
                            }
                        ],
                        "total": 350,
                    },
                }
            ]
        )
    )
    integration = ExtractionIntegration(api_key="test", model="test-model", client=client)

    result = await integration.extract(transcript)

    assert result.line_items[0].flagged is False
    assert result.line_items[0].flag_reason is None


async def test_extract_stamps_backend_owned_transcript_and_pipeline_version() -> None:
    transcript = TRANSCRIPTS["clean_with_total"]
    client = _FakeClient(
        lambda _: _FakeResponse(
            content=[
                {
                    "type": "tool_use",
                    "input": {
                        "line_items": [
                            {
                                "description": "Spread mulch",
                                "details": "5 yards",
                                "price": 350,
                                "price_status": "priced",
                            }
                        ],
                        "notes_candidate": None,
                        "pricing_candidates": {"explicit_total": 350},
                        "unresolved_items": [],
                    },
                }
            ]
        )
    )
    integration = ExtractionIntegration(api_key="test", model="test-model", client=client)

    result = await integration.extract(transcript)

    assert result.transcript == transcript
    assert result.pipeline_version == "v2.5"


async def test_extract_degrades_when_substantial_transcript_has_no_line_items() -> None:
    transcript = (
        "Customer asked for gutter cleaning, downspout flush, roof debris sweep, driveway edge "
        "cleanup, and mulch touch-up around front beds, then asked us to confirm schedule, "
        "materials, and final scope details before the next rain."
    )
    client = _FakeClient(
        lambda _: _FakeResponse(
            content=[
                {
                    "type": "tool_use",
                    "input": {
                        "transcript": transcript,
                        "line_items": [],
                        "total": None,
                    },
                }
            ]
        )
    )
    integration = ExtractionIntegration(api_key="test", model="test-model", client=client)

    result = await integration.extract(transcript)

    assert result.extraction_tier == "degraded"
    assert (
        result.extraction_degraded_reason_code
        == SEMANTIC_DEGRADED_REASON_EMPTY_LINE_ITEMS_SUBSTANTIAL_TRANSCRIPT
    )


async def test_extract_adds_warning_when_total_has_no_priced_line_items() -> None:
    transcript = TRANSCRIPTS["total_only"]
    client = _FakeClient(
        lambda _: _FakeResponse(
            content=[
                {
                    "type": "tool_use",
                    "input": {
                        "transcript": transcript,
                        "line_items": [
                            {
                                "description": "Driveway repair and reseal",
                                "details": None,
                                "price": None,
                                "price_status": "unknown",
                            }
                        ],
                        "pricing_hints": {"explicit_total": 2100},
                    },
                }
            ]
        )
    )
    integration = ExtractionIntegration(api_key="test", model="test-model", client=client)

    result = await integration.extract(transcript)

    assert result.extraction_tier == "primary"
    assert result.extraction_degraded_reason_code is None
    assert any(
        "explicit total was extracted without priced line items" in segment.raw_text.lower()
        for segment in result.unresolved_segments
    )


async def test_extract_flags_duplicate_line_items_with_warning_note() -> None:
    transcript = TRANSCRIPTS["clean_with_total"]
    client = _FakeClient(
        lambda _: _FakeResponse(
            content=[
                {
                    "type": "tool_use",
                    "input": {
                        "transcript": transcript,
                        "line_items": [
                            {
                                "description": "Brown mulch",
                                "details": "Front beds",
                                "price": 120,
                                "price_status": "priced",
                            },
                            {
                                "description": "brown   mulch",
                                "details": "Walkway beds",
                                "price": 120,
                                "price_status": "priced",
                            },
                        ],
                        "total": 240,
                    },
                }
            ]
        )
    )
    integration = ExtractionIntegration(api_key="test", model="test-model", client=client)

    result = await integration.extract(transcript)

    assert result.extraction_tier == "primary"
    assert all(item.flagged is True for item in result.line_items)
    assert all(item.flag_reason for item in result.line_items)


async def test_tool_schema_line_items_include_optional_flag_fields() -> None:
    line_item_schema = EXTRACTION_TOOL_SCHEMA["properties"]["line_items"]["items"]
    assert line_item_schema["properties"]["price_status"] == {
        "type": "string",
        "enum": ["priced", "included", "unknown"],
    }
    assert line_item_schema["properties"]["flagged"] == {"type": "boolean"}
    assert line_item_schema["properties"]["flag_reason"] == {"type": ["string", "null"]}
    assert "price_status" in line_item_schema["required"]
    assert "flagged" not in line_item_schema["required"]
    assert "flag_reason" not in line_item_schema["required"]
    assert "raw_text" not in line_item_schema["properties"]
    assert "confidence" not in line_item_schema["properties"]

    required_fields = set(EXTRACTION_TOOL_SCHEMA["required"])
    assert "notes_candidate" in required_fields
    assert "pricing_candidates" in required_fields
    assert "unresolved_items" in required_fields
    assert "transcript" not in required_fields
    assert "pipeline_version" not in required_fields
    assert "confidence_notes" not in required_fields


async def test_hidden_item_id_is_deterministic_and_distinguishes_content() -> None:
    first = build_hidden_item_id("unresolved", "note", "none", "Gate code 1942")
    second = build_hidden_item_id(" unresolved ", "NOTE", "none", " gate code 1942 ")
    different = build_hidden_item_id("unresolved", "note", "none", "Gate code 7788")

    assert first == second
    assert first != different


@pytest.mark.parametrize("fixture_name", sorted(TRANSCRIPTS))
async def test_extract_exercises_all_transcript_fixtures(fixture_name: str) -> None:
    transcript = TRANSCRIPTS[fixture_name]

    def _factory(kwargs: dict[str, object]) -> _FakeResponse:
        messages = kwargs["messages"]
        assert isinstance(messages, list)
        assert messages
        last_message = messages[-1]
        assert isinstance(last_message, dict)
        content = last_message["content"]
        assert isinstance(content, str)
        request_payload = json.loads(content)
        prepared_capture_input = request_payload["prepared_capture_input"]
        assert prepared_capture_input["transcript"] == transcript
        assert prepared_capture_input["source_type"] == "text"
        assert prepared_capture_input["raw_typed_notes"] == transcript
        assert prepared_capture_input["raw_transcript"] is None
        capture_segments = request_payload["capture_segments"]
        assert capture_segments
        assert capture_segments[0]["raw_text"]
        return _FakeResponse(
            content=[
                {
                    "type": "tool_use",
                    "input": {
                        "transcript": transcript,
                        "line_items": [
                            {
                                "description": f"Extracted from {fixture_name}",
                                "details": None,
                                "price": None,
                                "price_status": "unknown",
                            }
                        ],
                        "total": None,
                    },
                }
            ]
        )

    client = _FakeClient(_factory)
    integration = ExtractionIntegration(api_key="test", model="test-model", client=client)

    result = await integration.extract(transcript)

    assert result.transcript == transcript
    assert result.line_items[0].description.startswith("Extracted from")


async def test_extract_emits_trace_events_for_primary_repair_and_result_stages(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    transcript = TRANSCRIPTS["clean_with_total"]
    trace_calls: list[dict[str, object]] = []

    def _capture_trace(
        event: str,
        *,
        stage: str,
        outcome: str,
        **fields: object,
    ) -> None:
        trace_calls.append(
            {
                "event": event,
                "stage": stage,
                "outcome": outcome,
                **fields,
            }
        )

    monkeypatch.setattr(extraction_module, "log_extraction_trace", _capture_trace)
    client = _SequencedClient(
        [
            _FakeResponse(
                content=[
                    {
                        "type": "tool_use",
                        "input": {
                            "transcript": transcript,
                            "line_items": "invalid-shape",
                            "total": 435,
                        },
                    }
                ]
            ),
            _FakeResponse(
                content=[
                    {
                        "type": "tool_use",
                        "input": {
                            "transcript": transcript,
                            "line_items": [
                                {
                                    "description": "Trim shrubs",
                                    "details": "Front beds",
                                    "price": 125,
                                    "price_status": "priced",
                                }
                            ],
                            "pricing_hints": {"explicit_total": 125},
                        },
                    }
                ]
            ),
        ]
    )
    integration = ExtractionIntegration(api_key="test", model="test-model", client=client)

    result = await integration.extract(transcript)

    assert result.total == 125
    assert ("primary", "started") in {(call["stage"], call["outcome"]) for call in trace_calls}
    assert ("primary", "provider_response") in {
        (call["stage"], call["outcome"]) for call in trace_calls
    }
    assert ("repair", "started") in {(call["stage"], call["outcome"]) for call in trace_calls}
    assert ("repair", "succeeded") in {(call["stage"], call["outcome"]) for call in trace_calls}
    assert ("result", "succeeded") in {(call["stage"], call["outcome"]) for call in trace_calls}


async def test_guard_flags_line_items_with_price_in_description() -> None:
    transcript = TRANSCRIPTS["clean_with_total"]
    client = _FakeClient(
        lambda _: _FakeResponse(
            content=[
                {
                    "type": "tool_use",
                    "input": {
                        "transcript": transcript,
                        "line_items": [
                            {
                                "description": "Premium service $500",
                                "details": None,
                                "price": None,
                                "price_status": "unknown",
                            },
                            {
                                "description": "Standard service",
                                "details": None,
                                "price": 200,
                                "price_status": "priced",
                            },
                        ],
                        "total": None,
                    },
                }
            ]
        )
    )
    integration = ExtractionIntegration(api_key="test", model="test-model", client=client)

    result = await integration.extract(transcript)

    assert result.line_items[0].flagged is True
    assert "price token" in (result.line_items[0].flag_reason or "").lower()
    assert result.line_items[1].flagged is False


async def test_guard_flags_line_items_with_duplicate_details() -> None:
    transcript = TRANSCRIPTS["clean_with_total"]
    client = _FakeClient(
        lambda _: _FakeResponse(
            content=[
                {
                    "type": "tool_use",
                    "input": {
                        "transcript": transcript,
                        "line_items": [
                            {
                                "description": "Mulch installation",
                                "details": "Mulch installation",
                                "price": 150,
                                "price_status": "priced",
                            },
                            {
                                "description": "Weed removal",
                                "details": "Spot treatment only",
                                "price": 75,
                                "price_status": "priced",
                            },
                        ],
                        "total": None,
                    },
                }
            ]
        )
    )
    integration = ExtractionIntegration(api_key="test", model="test-model", client=client)

    result = await integration.extract(transcript)

    assert result.line_items[0].flagged is True
    assert "duplicate" in (result.line_items[0].flag_reason or "").lower()
    assert result.line_items[1].flagged is False


async def test_extract_preserves_mixed_provenance_in_model_request_payload() -> None:
    prepared_capture_input = PreparedCaptureInput(
        transcript="voice transcript text\n\ntyped note text",
        source_type="voice+text",
        raw_typed_notes="typed note text",
        raw_transcript="voice transcript text",
    )
    captured_messages: list[str] = []

    def _factory(kwargs: dict[str, object]) -> _FakeResponse:
        messages = kwargs["messages"]
        assert isinstance(messages, list)
        assert messages
        first_message = messages[0]
        assert isinstance(first_message, dict)
        content = first_message["content"]
        assert isinstance(content, str)
        captured_messages.append(content)
        return _FakeResponse(
            content=[
                {
                    "type": "tool_use",
                    "input": {
                        "transcript": prepared_capture_input.transcript,
                        "line_items": [],
                    },
                }
            ]
        )

    integration = ExtractionIntegration(
        api_key="test",
        model="test-model",
        client=_FakeClient(_factory),
    )

    result = await integration.extract(prepared_capture_input)

    assert result.transcript == prepared_capture_input.transcript
    assert captured_messages
    request_payload = json.loads(captured_messages[0])
    assert request_payload["prepared_capture_input"]["source_type"] == "voice+text"
    assert request_payload["prepared_capture_input"]["raw_typed_notes"] == "typed note text"
    assert request_payload["prepared_capture_input"]["raw_transcript"] == "voice transcript text"
