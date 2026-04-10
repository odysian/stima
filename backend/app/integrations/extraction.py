"""Claude integration for converting freeform notes into structured quote drafts."""

from __future__ import annotations

import asyncio
import contextvars
import json
import secrets
from dataclasses import dataclass
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

EXTRACTION_REPAIR_SYSTEM_PROMPT = (
    "You are repairing invalid structured extraction tool output. "
    "Return only corrected tool output that strictly matches the extraction schema."
)

EXTRACTION_DEGRADED_REASON_VALIDATION_REPAIR_FAILED = "validation_repair_failed"

_RETRY_BASE_DELAY_SECONDS = 0.25
_RETRY_MAX_DELAY_SECONDS = 2.0


class ExtractionError(Exception):
    """Raised when quote extraction cannot produce a valid structured payload."""


@dataclass(frozen=True, slots=True)
class ExtractionCallMetadata:
    """Telemetry captured from the most recent extraction provider call."""

    model_id: str | None
    token_usage: dict[str, int] | None
    repair_attempted: bool = False
    repair_outcome: str | None = None
    repair_validation_error_count: int | None = None


_LAST_CALL_METADATA_VAR: contextvars.ContextVar[ExtractionCallMetadata | None] = (
    contextvars.ContextVar("stima_extraction_call_metadata", default=None)
)


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
        _set_last_call_metadata(model_id=self._model, token_usage=None)

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
        response_model_id = getattr(response, "model", None) or self._model
        response_token_usage = _extract_token_usage(response)
        _set_last_call_metadata(
            model_id=response_model_id,
            token_usage=response_token_usage,
            repair_attempted=False,
            repair_outcome="not_attempted",
            repair_validation_error_count=None,
        )

        payload = _extract_tool_payload(response)
        payload.setdefault("transcript", normalized_notes)
        payload.setdefault("line_items", [])
        payload.setdefault("confidence_notes", [])

        try:
            return ExtractionResult.model_validate(payload)
        except ValidationError as exc:
            validation_errors = _compact_validation_errors(exc)
            try:
                repair_response = await self._request_with_retry(
                    typed_client,
                    _build_repair_request(
                        notes=normalized_notes,
                        invalid_payload=payload,
                        validation_errors=validation_errors,
                    ),
                    system_prompt=EXTRACTION_REPAIR_SYSTEM_PROMPT,
                )
            except ExtractionError:
                _set_last_call_metadata(
                    model_id=response_model_id,
                    token_usage=response_token_usage,
                    repair_attempted=True,
                    repair_outcome="repair_request_failed",
                    repair_validation_error_count=len(validation_errors),
                )
                raise
            repair_usage = _extract_token_usage(repair_response)
            repair_model_id = getattr(repair_response, "model", None) or self._model
            repair_payload = _extract_tool_payload(repair_response)
            repair_payload.setdefault("transcript", normalized_notes)
            repair_payload.setdefault("line_items", [])
            repair_payload.setdefault("confidence_notes", [])
            try:
                repaired_result = ExtractionResult.model_validate(repair_payload)
            except ValidationError:
                _set_last_call_metadata(
                    model_id=repair_model_id,
                    token_usage=repair_usage,
                    repair_attempted=True,
                    repair_outcome="repair_invalid",
                    repair_validation_error_count=len(validation_errors),
                )
                return _build_validation_repair_failed_result(transcript=normalized_notes)
            _set_last_call_metadata(
                model_id=repair_model_id,
                token_usage=repair_usage,
                repair_attempted=True,
                repair_outcome="repair_succeeded",
                repair_validation_error_count=len(validation_errors),
            )
            return repaired_result

    @property
    def model_id(self) -> str:
        """Return the configured provider model id for extraction calls."""
        return self._model

    def pop_last_call_metadata(self) -> ExtractionCallMetadata | None:
        """Return and clear per-task extraction telemetry from the latest call."""
        metadata = _LAST_CALL_METADATA_VAR.get()
        _LAST_CALL_METADATA_VAR.set(None)
        return metadata

    async def _request_with_retry(
        self,
        typed_client: Any,
        request_content: str,
        *,
        system_prompt: str = EXTRACTION_SYSTEM_PROMPT,
    ) -> object:
        last_error: Exception | None = None
        for attempt in range(1, self._max_attempts + 1):
            try:
                return await typed_client.messages.create(
                    model=self._model,
                    max_tokens=800,
                    temperature=0,
                    system=system_prompt,
                    messages=[
                        {
                            "role": "user",
                            "content": request_content,
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


def _set_last_call_metadata(
    *,
    model_id: str | None,
    token_usage: dict[str, int] | None,
    repair_attempted: bool = False,
    repair_outcome: str | None = None,
    repair_validation_error_count: int | None = None,
) -> None:
    _LAST_CALL_METADATA_VAR.set(
        ExtractionCallMetadata(
            model_id=model_id,
            token_usage=token_usage,
            repair_attempted=repair_attempted,
            repair_outcome=repair_outcome,
            repair_validation_error_count=repair_validation_error_count,
        )
    )


def _extract_token_usage(response: object) -> dict[str, int] | None:
    usage = getattr(response, "usage", None)
    if usage is None:
        return None

    usage_payload: dict[str, int] = {}
    for key in (
        "input_tokens",
        "output_tokens",
        "cache_creation_input_tokens",
        "cache_read_input_tokens",
    ):
        value = _token_usage_int(usage, key)
        if value is not None:
            usage_payload[key] = value
    return usage_payload or None


def _token_usage_int(usage: object, key: str) -> int | None:
    if isinstance(usage, dict):
        candidate = usage.get(key)
    else:
        candidate = getattr(usage, key, None)
    return candidate if isinstance(candidate, int) else None


def _build_repair_request(
    *,
    notes: str,
    invalid_payload: dict[str, Any],
    validation_errors: list[str],
) -> str:
    compact_payload = json.dumps(invalid_payload, ensure_ascii=True, separators=(",", ":"))
    compact_errors = "\n".join(f"- {error}" for error in validation_errors)
    return (
        "Original notes:\n"
        f"{notes}\n\n"
        "Invalid tool output JSON:\n"
        f"{compact_payload}\n\n"
        "Schema validation errors:\n"
        f"{compact_errors}\n\n"
        "Return corrected structured tool output only."
    )


def _compact_validation_errors(error: ValidationError) -> list[str]:
    compact: list[str] = []
    for item in error.errors(include_url=False):
        location = ".".join(str(part) for part in item.get("loc", ()))
        message = str(item.get("msg", "Invalid value"))
        issue_type = str(item.get("type", "validation_error"))
        if location:
            compact.append(f"{location}: {message} ({issue_type})")
        else:
            compact.append(f"{message} ({issue_type})")
    return compact


def _build_validation_repair_failed_result(*, transcript: str) -> ExtractionResult:
    return ExtractionResult(
        transcript=transcript,
        line_items=[],
        total=None,
        confidence_notes=[],
        extraction_tier="degraded",
        extraction_degraded_reason_code=EXTRACTION_DEGRADED_REASON_VALIDATION_REPAIR_FAILED,
    )
