"""Extraction integration behavior tests with mocked Claude client responses."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import pytest

from app.features.quotes.tests.fixtures.transcripts import TRANSCRIPTS
from app.integrations.extraction import (
    EXTRACTION_TOOL_SCHEMA,
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
                            },
                            {
                                "description": "Bag leaves",
                                "details": None,
                                "price": None,
                            },
                        ],
                        "total": None,
                        "confidence_notes": ["No explicit pricing in notes"],
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
                            }
                        ],
                        "total": 2100,
                        "confidence_notes": [],
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
                            },
                            {
                                "description": "Power wash siding",
                                "details": "Normal rate not provided",
                                "price": None,
                            },
                        ],
                        "total": None,
                        "confidence_notes": ["Siding price ambiguous in transcript"],
                    },
                }
            ]
        )
    )
    integration = ExtractionIntegration(api_key="test", model="test-model", client=client)

    result = await integration.extract(transcript)

    assert result.line_items
    assert result.line_items[0].description == "Power wash deck"
    assert "ambiguous" in result.confidence_notes[0].lower()


async def test_extract_raises_typed_error_for_malformed_payload() -> None:
    transcript = TRANSCRIPTS["clean_with_total"]
    client = _FakeClient(
        lambda _: _FakeResponse(
            content=[
                {
                    "type": "tool_use",
                    "input": {
                        "transcript": transcript,
                        "line_items": "invalid-shape",
                        "total": 435,
                        "confidence_notes": [],
                    },
                }
            ]
        )
    )
    integration = ExtractionIntegration(api_key="test", model="test-model", client=client)

    with pytest.raises(ExtractionError, match="schema"):
        await integration.extract(transcript)


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
                                "flagged": True,
                                "flag_reason": (
                                    "Price seems implausibly high for a single side wall"
                                ),
                            }
                        ],
                        "total": 9000,
                        "confidence_notes": [],
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
                            }
                        ],
                        "total": 350,
                        "confidence_notes": [],
                    },
                }
            ]
        )
    )
    integration = ExtractionIntegration(api_key="test", model="test-model", client=client)

    result = await integration.extract(transcript)

    assert result.line_items[0].flagged is False
    assert result.line_items[0].flag_reason is None


async def test_tool_schema_line_items_include_optional_flag_fields() -> None:
    line_item_schema = EXTRACTION_TOOL_SCHEMA["properties"]["line_items"]["items"]
    assert line_item_schema["properties"]["flagged"] == {"type": "boolean"}
    assert line_item_schema["properties"]["flag_reason"] == {"type": ["string", "null"]}
    assert "flagged" not in line_item_schema["required"]
    assert "flag_reason" not in line_item_schema["required"]


@pytest.mark.parametrize("fixture_name", sorted(TRANSCRIPTS))
async def test_extract_exercises_all_transcript_fixtures(fixture_name: str) -> None:
    transcript = TRANSCRIPTS[fixture_name]

    def _factory(kwargs: dict[str, object]) -> _FakeResponse:
        messages = kwargs["messages"]
        assert isinstance(messages, list)
        assert messages
        last_message = messages[-1]
        assert isinstance(last_message, dict)
        assert last_message["content"] == transcript
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
                            }
                        ],
                        "total": None,
                        "confidence_notes": [],
                    },
                }
            ]
        )

    client = _FakeClient(_factory)
    integration = ExtractionIntegration(api_key="test", model="test-model", client=client)

    result = await integration.extract(transcript)

    assert result.transcript == transcript
    assert result.line_items[0].description.startswith("Extracted from")
