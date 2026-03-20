"""Claude integration for converting freeform notes into structured quote drafts."""

from __future__ import annotations

from typing import Any, cast

from anthropic import AsyncAnthropic
from pydantic import ValidationError

from app.features.quotes.schemas import ExtractionResult

EXTRACTION_TOOL_NAME = "extract_quote"

EXTRACTION_TOOL_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "transcript": {"type": "string"},
        "line_items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "description": {"type": "string"},
                    "details": {"type": ["string", "null"]},
                    "price": {"type": ["number", "null"]},
                },
                "required": ["description"],
                "additionalProperties": False,
            },
        },
        "total": {"type": ["number", "null"]},
        "confidence_notes": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["transcript", "line_items", "confidence_notes"],
    "additionalProperties": False,
}

EXTRACTION_SYSTEM_PROMPT = (
    "Extract quote line items and totals from contractor notes. "
    "Do not invent pricing. Use null for missing prices and totals. "
    "Return only structured tool output."
)


class ExtractionError(Exception):
    """Raised when quote extraction cannot produce a valid structured payload."""


class ExtractionIntegration:
    """Convert typed notes to a validated extraction result via Claude."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        client: object | None = None,
    ) -> None:
        self._api_key = api_key
        self._model = model
        self._client = client

    async def extract(self, notes: str) -> ExtractionResult:
        """Call Claude structured output and validate the response contract."""
        normalized_notes = notes.strip()
        if not normalized_notes:
            raise ExtractionError("notes cannot be empty")

        if self._client is None:
            if not self._api_key:
                raise ExtractionError("Extraction API key is not configured")
            self._client = AsyncAnthropic(api_key=self._api_key)

        client = self._client
        if client is None:  # pragma: no cover - defensive invariant
            raise ExtractionError("Claude client was not initialized")
        typed_client = cast(Any, client)

        try:
            response = await typed_client.messages.create(
                model=self._model,
                max_tokens=800,
                temperature=0,
                system=EXTRACTION_SYSTEM_PROMPT,
                messages=[
                    {
                        "role": "user",
                        "content": normalized_notes,
                    }
                ],
                tools=[
                    {
                        "name": EXTRACTION_TOOL_NAME,
                        "description": (
                            "Extract quote line items, optional per-item pricing, "
                            "optional total, and confidence notes."
                        ),
                        "input_schema": EXTRACTION_TOOL_SCHEMA,
                    }
                ],
                tool_choice={"type": "tool", "name": EXTRACTION_TOOL_NAME},
            )
        except Exception as exc:  # pragma: no cover - provider-level failures
            raise ExtractionError(f"Claude request failed: {exc}") from exc

        payload = _extract_tool_payload(response)
        payload.setdefault("transcript", normalized_notes)
        payload.setdefault("line_items", [])
        payload.setdefault("confidence_notes", [])

        try:
            return ExtractionResult.model_validate(payload)
        except ValidationError as exc:
            raise ExtractionError("Claude response did not match extraction schema") from exc


def _extract_tool_payload(response: object) -> dict[str, Any]:
    """Return tool payload from Claude response content blocks."""
    content = getattr(response, "content", None)
    if not isinstance(content, list):
        raise ExtractionError("Claude response missing content blocks")

    for block in content:
        if isinstance(block, dict):
            if block.get("type") != "tool_use":
                continue
            tool_input = block.get("input")
            if isinstance(tool_input, dict):
                return dict(tool_input)
            continue

        block_type = getattr(block, "type", None)
        if block_type != "tool_use":
            continue

        tool_input = getattr(block, "input", None)
        if isinstance(tool_input, dict):
            return dict(tool_input)

    raise ExtractionError("Claude response missing structured tool output")
