"""Claude integration for converting freeform notes into structured quote drafts."""

from __future__ import annotations

import asyncio
import secrets
from typing import Any, cast

import anthropic
from anthropic import AsyncAnthropic
from pydantic import ValidationError

from app.features.quotes.schemas import ExtractionResult
from app.shared.input_limits import (
    CONFIDENCE_NOTE_MAX_CHARS,
    CONFIDENCE_NOTES_MAX_ITEMS,
    DOCUMENT_LINE_ITEMS_MAX_ITEMS,
    EXTRACTION_TRANSCRIPT_MAX_CHARS,
    LINE_ITEM_DESCRIPTION_MAX_CHARS,
    LINE_ITEM_DETAILS_MAX_CHARS,
)
from app.shared.observability import log_provider_quota_exhausted, log_provider_retry

EXTRACTION_TOOL_NAME = "extract_quote"

EXTRACTION_TOOL_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "transcript": {"type": "string", "maxLength": EXTRACTION_TRANSCRIPT_MAX_CHARS},
        "line_items": {
            "type": "array",
            "maxItems": DOCUMENT_LINE_ITEMS_MAX_ITEMS,
            "items": {
                "type": "object",
                "properties": {
                    "description": {
                        "type": "string",
                        "maxLength": LINE_ITEM_DESCRIPTION_MAX_CHARS,
                    },
                    "details": {
                        "type": ["string", "null"],
                        "maxLength": LINE_ITEM_DETAILS_MAX_CHARS,
                    },
                    "price": {"type": ["number", "null"]},
                    "flagged": {"type": "boolean"},
                    "flag_reason": {"type": ["string", "null"]},
                },
                "required": ["description"],
                "additionalProperties": False,
            },
        },
        "total": {"type": ["number", "null"]},
        "confidence_notes": {
            "type": "array",
            "maxItems": CONFIDENCE_NOTES_MAX_ITEMS,
            "items": {
                "type": "string",
                "maxLength": CONFIDENCE_NOTE_MAX_CHARS,
            },
        },
    },
    "required": ["transcript", "line_items", "confidence_notes"],
    "additionalProperties": False,
}

EXTRACTION_SYSTEM_PROMPT = (
    "Extract quote line items and totals from contractor notes. "
    "Do not invent pricing. Use null for missing prices and totals. "
    "Set line-item flagged=true only for strong review signals: likely audio mishears, "
    "clearly implausible single-item prices, or critically ambiguous quantity/unit phrasing. "
    "When flagged=true, include a short flag_reason. Keep flagged false otherwise. "
    "Return only structured tool output."
)

_RETRY_BASE_DELAY_SECONDS = 0.25
_RETRY_MAX_DELAY_SECONDS = 2.0


class ExtractionError(Exception):
    """Raised when quote extraction cannot produce a valid structured payload."""


class ExtractionIntegration:
    """Convert typed notes to a validated extraction result via Claude."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        timeout_seconds: float = 30.0,
        max_attempts: int = 3,
        client: object | None = None,
    ) -> None:
        self._api_key = api_key
        self._model = model
        self._timeout_seconds = timeout_seconds
        self._max_attempts = max_attempts
        self._client = client

    async def extract(self, notes: str) -> ExtractionResult:
        """Call Claude structured output and validate the response contract."""
        normalized_notes = notes.strip()
        if not normalized_notes:
            raise ExtractionError("notes cannot be empty")

        if self._client is None:
            if not self._api_key:
                raise ExtractionError("Extraction API key is not configured")
            self._client = AsyncAnthropic(
                api_key=self._api_key,
                timeout=self._timeout_seconds,
                max_retries=0,
            )

        client = self._client
        if client is None:  # pragma: no cover - defensive invariant
            raise ExtractionError("Claude client was not initialized")
        typed_client = cast(Any, client)

        response = await self._request_with_retry(typed_client, normalized_notes)

        payload = _extract_tool_payload(response)
        payload.setdefault("transcript", normalized_notes)
        payload.setdefault("line_items", [])
        payload.setdefault("confidence_notes", [])

        try:
            return ExtractionResult.model_validate(payload)
        except ValidationError as exc:
            raise ExtractionError("Claude response did not match extraction schema") from exc

    async def _request_with_retry(self, typed_client: Any, normalized_notes: str) -> object:
        last_error: Exception | None = None
        for attempt in range(1, self._max_attempts + 1):
            try:
                return await typed_client.messages.create(
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
            except Exception as exc:
                last_error = exc
                upstream_status = _provider_status_code(exc)
                if attempt >= self._max_attempts or not _is_retryable_provider_error(exc):
                    if upstream_status == 429:
                        log_provider_quota_exhausted(
                            provider="anthropic",
                            upstream_status=upstream_status,
                            attempt=attempt,
                            max_attempts=self._max_attempts,
                        )
                    break
                retry_delay_seconds = _retry_delay_seconds(attempt)
                if upstream_status == 429:
                    log_provider_retry(
                        provider="anthropic",
                        upstream_status=upstream_status,
                        attempt=attempt,
                        max_attempts=self._max_attempts,
                        backoff_ms=int(retry_delay_seconds * 1000),
                    )
                await asyncio.sleep(retry_delay_seconds)

        if last_error is None:  # pragma: no cover - defensive invariant
            raise ExtractionError("Claude request failed")
        raise ExtractionError(f"Claude request failed: {last_error}") from last_error


def is_retryable_extraction_error(exc: Exception) -> bool:
    """Return whether an extraction failure should be retried at the job layer."""
    candidate = exc
    if isinstance(exc, ExtractionError) and isinstance(exc.__cause__, Exception):
        candidate = exc.__cause__
    return _is_retryable_provider_error(candidate)


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


def _is_retryable_provider_error(exc: Exception) -> bool:
    if isinstance(
        exc,
        (
            anthropic.APIConnectionError,
            anthropic.APITimeoutError,
            asyncio.TimeoutError,
            TimeoutError,
        ),
    ):
        return True
    if isinstance(exc, anthropic.RateLimitError):
        return True
    if isinstance(exc, anthropic.InternalServerError):
        return True
    if isinstance(exc, anthropic.APIStatusError):
        return getattr(exc, "status_code", 0) >= 500
    status_code = _provider_status_code(exc)
    if isinstance(status_code, int):
        return status_code == 429 or status_code >= 500
    return False


def _provider_status_code(exc: Exception) -> int | None:
    status_code = getattr(exc, "status_code", None)
    if isinstance(status_code, int):
        return status_code
    if isinstance(exc, anthropic.RateLimitError):
        return 429
    return None


def _retry_delay_seconds(attempt: int) -> float:
    base_delay = min(_RETRY_BASE_DELAY_SECONDS * (2 ** (attempt - 1)), _RETRY_MAX_DELAY_SECONDS)
    jitter_bound = min(0.1, base_delay / 2)
    if jitter_bound <= 0:
        return base_delay
    return base_delay + (secrets.randbelow(1000) / 1000) * jitter_bound
