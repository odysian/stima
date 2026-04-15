"""Claude integration for converting freeform notes into structured quote drafts."""

from __future__ import annotations

import asyncio
import contextvars
import json
import logging
import re
import secrets
from dataclasses import dataclass
from typing import Any, Literal, cast

import anthropic
from anthropic import AsyncAnthropic
from pydantic import ValidationError

from app.features.quotes.schemas import ExtractionResult, LineItemExtracted
from app.shared.extraction_logger import log_extraction_trace
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
EXTRACTION_INVOCATION_TIER_PRIMARY: Literal["primary"] = "primary"
EXTRACTION_INVOCATION_TIER_FALLBACK: Literal["fallback"] = "fallback"
EXTRACTION_PROMPT_VARIANT_PRIMARY_DEFAULT = "primary_default"
EXTRACTION_PROMPT_VARIANT_FALLBACK_DEFAULT = "fallback_default"
EXTRACTION_PROMPT_VARIANT_REPAIR_SUFFIX = "repair"

SEMANTIC_DEGRADED_REASON_EMPTY_LINE_ITEMS_SUBSTANTIAL_TRANSCRIPT = (
    "semantic_empty_line_items_substantial_transcript"
)
_SEMANTIC_EMPTY_LINE_ITEMS_MIN_TRANSCRIPT_CHARS = 120
_SEMANTIC_EMPTY_LINE_ITEMS_MIN_WORDS = 18
_SEMANTIC_NOTE_EMPTY_LINE_ITEMS_SUBSTANTIAL_TRANSCRIPT = (
    "No line items were extracted from a substantial transcript; manual review is required."
)
_SEMANTIC_NOTE_TOTAL_WITHOUT_PRICED_ITEMS = (
    "Total was extracted without any priced line items; review pricing details."
)
_SEMANTIC_NOTE_DUPLICATE_LINE_ITEMS = (
    "Duplicate extracted line items were detected and flagged for review."
)
_SEMANTIC_FLAG_REASON_DUPLICATE_LINE_ITEM = "Possible duplicate line item from extraction output"
_WHITESPACE_PATTERN = re.compile(r"\s+")

_RETRY_BASE_DELAY_SECONDS = 0.25
_RETRY_MAX_DELAY_SECONDS = 2.0
_TRACE_EVENT_NAME = "extraction.trace"


class ExtractionError(Exception):
    """Raised when quote extraction cannot produce a valid structured payload."""


@dataclass(frozen=True, slots=True)
class ExtractionCallMetadata:
    """Telemetry captured from the most recent extraction provider call."""

    model_id: str | None
    token_usage: dict[str, int] | None
    invocation_tier: Literal["primary", "fallback"] = EXTRACTION_INVOCATION_TIER_PRIMARY
    prompt_variant: str | None = None
    repair_attempted: bool = False
    repair_outcome: str | None = None
    repair_validation_error_count: int | None = None


@dataclass(frozen=True, slots=True)
class _ExtractionTierConfig:
    tier: Literal["primary", "fallback"]
    model_id: str
    prompt_variant: str


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
        fallback_model: str | None = None,
        timeout_seconds: float = 30.0,
        max_attempts: int = 3,
        primary_prompt_variant: str = EXTRACTION_PROMPT_VARIANT_PRIMARY_DEFAULT,
        fallback_prompt_variant: str = EXTRACTION_PROMPT_VARIANT_FALLBACK_DEFAULT,
        client: object | None = None,
    ) -> None:
        self._api_key = api_key
        self._primary_model = model
        self._fallback_model = fallback_model.strip() if isinstance(fallback_model, str) else None
        if self._fallback_model == "":
            self._fallback_model = None
        self._timeout_seconds = timeout_seconds
        self._max_attempts = max_attempts
        self._primary_prompt_variant = (
            primary_prompt_variant.strip() or EXTRACTION_PROMPT_VARIANT_PRIMARY_DEFAULT
        )
        self._fallback_prompt_variant = (
            fallback_prompt_variant.strip() or EXTRACTION_PROMPT_VARIANT_FALLBACK_DEFAULT
        )
        self._client = client

    async def extract(self, notes: str) -> ExtractionResult:
        """Call Claude structured output and validate the response contract."""
        normalized_notes = notes.strip()
        if not normalized_notes:
            raise ExtractionError("notes cannot be empty")
        _set_last_call_metadata(
            model_id=self._primary_model,
            token_usage=None,
            invocation_tier=EXTRACTION_INVOCATION_TIER_PRIMARY,
            prompt_variant=self._primary_prompt_variant,
        )

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

        tier_sequence = self._build_tier_sequence()
        last_error: ExtractionError | None = None
        for tier in tier_sequence:
            try:
                return await self._extract_for_tier(
                    typed_client,
                    normalized_notes,
                    tier=tier,
                )
            except ExtractionError as exc:
                last_error = exc
                log_extraction_trace(
                    _TRACE_EVENT_NAME,
                    stage=tier.tier,
                    outcome="failed",
                    level=logging.WARNING,
                    extraction_model_id=tier.model_id,
                    extraction_prompt_variant=tier.prompt_variant,
                    error_class=type(exc).__name__,
                    error_message=str(exc),
                )
                continue

        if last_error is None:  # pragma: no cover - defensive invariant
            raise ExtractionError("Claude request failed")
        log_extraction_trace(
            _TRACE_EVENT_NAME,
            stage="result",
            outcome="failed",
            level=logging.ERROR,
            reason="all_tiers_failed",
            error_class=type(last_error).__name__,
            error_message=str(last_error),
        )
        raise last_error

    @property
    def model_id(self) -> str:
        """Return the configured primary provider model id for extraction calls."""
        return self._primary_model

    def pop_last_call_metadata(self) -> ExtractionCallMetadata | None:
        """Return and clear per-task extraction telemetry from the latest call."""
        metadata = _LAST_CALL_METADATA_VAR.get()
        _LAST_CALL_METADATA_VAR.set(None)
        return metadata

    def _build_tier_sequence(self) -> tuple[_ExtractionTierConfig, ...]:
        primary_tier = _ExtractionTierConfig(
            tier=EXTRACTION_INVOCATION_TIER_PRIMARY,
            model_id=self._primary_model,
            prompt_variant=self._primary_prompt_variant,
        )
        if self._fallback_model is None:
            return (primary_tier,)
        return (
            primary_tier,
            _ExtractionTierConfig(
                tier=EXTRACTION_INVOCATION_TIER_FALLBACK,
                model_id=self._fallback_model,
                prompt_variant=self._fallback_prompt_variant,
            ),
        )

    async def _extract_for_tier(
        self,
        typed_client: Any,
        normalized_notes: str,
        *,
        tier: _ExtractionTierConfig,
    ) -> ExtractionResult:
        log_extraction_trace(
            _TRACE_EVENT_NAME,
            stage=tier.tier,
            outcome="started",
            extraction_model_id=tier.model_id,
            extraction_prompt_variant=tier.prompt_variant,
            transcript_chars=len(normalized_notes),
            raw_transcript=normalized_notes,
        )
        _set_last_call_metadata(
            model_id=tier.model_id,
            token_usage=None,
            invocation_tier=tier.tier,
            prompt_variant=tier.prompt_variant,
        )

        response = await self._request_with_retry(
            typed_client,
            normalized_notes,
            model_id=tier.model_id,
            invocation_tier=tier.tier,
            prompt_variant=tier.prompt_variant,
        )
        response_model_id = getattr(response, "model", None) or tier.model_id
        response_token_usage = _extract_token_usage(response)
        _set_last_call_metadata(
            model_id=response_model_id,
            token_usage=response_token_usage,
            invocation_tier=tier.tier,
            prompt_variant=tier.prompt_variant,
            repair_attempted=False,
            repair_outcome="not_attempted",
            repair_validation_error_count=None,
        )

        payload = _extract_tool_payload(response)
        payload.setdefault("transcript", normalized_notes)
        payload.setdefault("line_items", [])
        payload.setdefault("confidence_notes", [])
        log_extraction_trace(
            _TRACE_EVENT_NAME,
            stage=tier.tier,
            outcome="provider_response",
            extraction_model_id=response_model_id,
            extraction_prompt_variant=tier.prompt_variant,
            token_input_tokens=_token_usage_value(response_token_usage, "input_tokens"),
            token_output_tokens=_token_usage_value(response_token_usage, "output_tokens"),
            line_item_count=_list_count(payload.get("line_items")),
            confidence_note_count=_list_count(payload.get("confidence_notes")),
            total_present=payload.get("total") is not None if "total" in payload else None,
            raw_transcript=normalized_notes,
            raw_tool_payload=payload,
        )

        try:
            validated_result = ExtractionResult.model_validate(payload)
            result = _apply_semantic_guard_rules(validated_result)
            _log_result_trace(
                result=result,
                invocation_tier=tier.tier,
                model_id=response_model_id,
                prompt_variant=tier.prompt_variant,
            )
            return result
        except ValidationError as exc:
            validation_errors = _compact_validation_errors(exc)
            repair_prompt_variant = (
                f"{tier.prompt_variant}:{EXTRACTION_PROMPT_VARIANT_REPAIR_SUFFIX}"
            )
            log_extraction_trace(
                _TRACE_EVENT_NAME,
                stage="repair",
                outcome="started",
                level=logging.WARNING,
                extraction_invocation_tier=tier.tier,
                extraction_model_id=response_model_id,
                extraction_prompt_variant=repair_prompt_variant,
                validation_error_count=len(validation_errors),
                raw_transcript=normalized_notes,
                raw_tool_payload=payload,
            )
            try:
                repair_response = await self._request_with_retry(
                    typed_client,
                    _build_repair_request(
                        notes=normalized_notes,
                        invalid_payload=payload,
                        validation_errors=validation_errors,
                    ),
                    model_id=tier.model_id,
                    invocation_tier=tier.tier,
                    prompt_variant=repair_prompt_variant,
                    system_prompt=EXTRACTION_REPAIR_SYSTEM_PROMPT,
                )
            except ExtractionError:
                _set_last_call_metadata(
                    model_id=response_model_id,
                    token_usage=response_token_usage,
                    invocation_tier=tier.tier,
                    prompt_variant=repair_prompt_variant,
                    repair_attempted=True,
                    repair_outcome="repair_request_failed",
                    repair_validation_error_count=len(validation_errors),
                )
                log_extraction_trace(
                    _TRACE_EVENT_NAME,
                    stage="repair",
                    outcome="failed",
                    level=logging.WARNING,
                    extraction_invocation_tier=tier.tier,
                    extraction_model_id=response_model_id,
                    extraction_prompt_variant=repair_prompt_variant,
                    validation_error_count=len(validation_errors),
                    reason="repair_request_failed",
                )
                raise
            repair_usage = _extract_token_usage(repair_response)
            repair_model_id = getattr(repair_response, "model", None) or tier.model_id
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
                    invocation_tier=tier.tier,
                    prompt_variant=repair_prompt_variant,
                    repair_attempted=True,
                    repair_outcome="repair_invalid",
                    repair_validation_error_count=len(validation_errors),
                )
                log_extraction_trace(
                    _TRACE_EVENT_NAME,
                    stage="repair",
                    outcome="failed",
                    level=logging.WARNING,
                    extraction_invocation_tier=tier.tier,
                    extraction_model_id=repair_model_id,
                    extraction_prompt_variant=repair_prompt_variant,
                    validation_error_count=len(validation_errors),
                    reason="repair_invalid",
                    token_input_tokens=_token_usage_value(repair_usage, "input_tokens"),
                    token_output_tokens=_token_usage_value(repair_usage, "output_tokens"),
                    raw_transcript=normalized_notes,
                    raw_tool_payload=repair_payload,
                )
                degraded_result = _build_validation_repair_failed_result(
                    transcript=normalized_notes
                )
                _log_result_trace(
                    result=degraded_result,
                    invocation_tier=tier.tier,
                    model_id=repair_model_id,
                    prompt_variant=repair_prompt_variant,
                )
                return degraded_result
            _set_last_call_metadata(
                model_id=repair_model_id,
                token_usage=repair_usage,
                invocation_tier=tier.tier,
                prompt_variant=repair_prompt_variant,
                repair_attempted=True,
                repair_outcome="repair_succeeded",
                repair_validation_error_count=len(validation_errors),
            )
            log_extraction_trace(
                _TRACE_EVENT_NAME,
                stage="repair",
                outcome="succeeded",
                extraction_invocation_tier=tier.tier,
                extraction_model_id=repair_model_id,
                extraction_prompt_variant=repair_prompt_variant,
                validation_error_count=len(validation_errors),
                token_input_tokens=_token_usage_value(repair_usage, "input_tokens"),
                token_output_tokens=_token_usage_value(repair_usage, "output_tokens"),
                line_item_count=_list_count(repair_payload.get("line_items")),
                confidence_note_count=_list_count(repair_payload.get("confidence_notes")),
                total_present=(
                    repair_payload.get("total") is not None if "total" in repair_payload else None
                ),
                raw_transcript=normalized_notes,
                raw_tool_payload=repair_payload,
            )
            result = _apply_semantic_guard_rules(repaired_result)
            _log_result_trace(
                result=result,
                invocation_tier=tier.tier,
                model_id=repair_model_id,
                prompt_variant=repair_prompt_variant,
            )
            return result

    async def _request_with_retry(
        self,
        typed_client: Any,
        request_content: str,
        *,
        model_id: str,
        invocation_tier: Literal["primary", "fallback"],
        prompt_variant: str,
        system_prompt: str = EXTRACTION_SYSTEM_PROMPT,
    ) -> object:
        last_error: Exception | None = None
        for attempt in range(1, self._max_attempts + 1):
            try:
                return await typed_client.messages.create(
                    model=model_id,
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
                            extraction_invocation_tier=invocation_tier,
                            extraction_model_id=model_id,
                            extraction_prompt_variant=prompt_variant,
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
                        extraction_invocation_tier=invocation_tier,
                        extraction_model_id=model_id,
                        extraction_prompt_variant=prompt_variant,
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
    invocation_tier: Literal["primary", "fallback"] = EXTRACTION_INVOCATION_TIER_PRIMARY,
    prompt_variant: str | None = None,
    repair_attempted: bool = False,
    repair_outcome: str | None = None,
    repair_validation_error_count: int | None = None,
) -> None:
    _LAST_CALL_METADATA_VAR.set(
        ExtractionCallMetadata(
            model_id=model_id,
            token_usage=token_usage,
            invocation_tier=invocation_tier,
            prompt_variant=prompt_variant,
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


def _token_usage_value(usage: dict[str, int] | None, key: str) -> int | None:
    if usage is None:
        return None
    value = usage.get(key)
    return value if isinstance(value, int) else None


def _list_count(value: object) -> int | None:
    if isinstance(value, list):
        return len(value)
    return None


def _log_result_trace(
    *,
    result: ExtractionResult,
    invocation_tier: Literal["primary", "fallback"],
    model_id: str,
    prompt_variant: str,
) -> None:
    log_extraction_trace(
        _TRACE_EVENT_NAME,
        stage="result",
        outcome="succeeded",
        extraction_invocation_tier=invocation_tier,
        extraction_model_id=model_id,
        extraction_prompt_variant=prompt_variant,
        extraction_tier=result.extraction_tier,
        extraction_degraded_reason_code=result.extraction_degraded_reason_code,
        line_item_count=len(result.line_items),
        confidence_note_count=len(result.confidence_notes),
        total_present=result.total is not None,
        raw_transcript=result.transcript,
        raw_tool_payload=result.model_dump(mode="json"),
    )


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


def _apply_semantic_guard_rules(result: ExtractionResult) -> ExtractionResult:
    """Apply incident-informed semantic checks after schema validation succeeds.

    Rule outcomes are intentionally constrained:
    - Empty line items + substantial transcript -> degraded (allowlisted structural failure).
    - Total without priced line items -> warning note only (tier remains primary).
    - Duplicate extracted line items -> line-level flags + warning note only.
    """

    confidence_notes = list(result.confidence_notes)
    line_items = list(result.line_items)
    extraction_tier = result.extraction_tier
    degraded_reason_code = result.extraction_degraded_reason_code

    if _should_degrade_for_empty_line_items_with_substantial_transcript(result):
        extraction_tier = "degraded"
        degraded_reason_code = SEMANTIC_DEGRADED_REASON_EMPTY_LINE_ITEMS_SUBSTANTIAL_TRANSCRIPT
        _append_semantic_note(
            confidence_notes,
            _SEMANTIC_NOTE_EMPTY_LINE_ITEMS_SUBSTANTIAL_TRANSCRIPT,
        )

    if _should_warn_for_total_without_priced_items(result):
        _append_semantic_note(confidence_notes, _SEMANTIC_NOTE_TOTAL_WITHOUT_PRICED_ITEMS)

    line_items = _apply_duplicate_line_item_flags(line_items, confidence_notes)

    return result.model_copy(
        update={
            "line_items": line_items,
            "confidence_notes": confidence_notes,
            "extraction_tier": extraction_tier,
            "extraction_degraded_reason_code": degraded_reason_code,
        }
    )


def _should_degrade_for_empty_line_items_with_substantial_transcript(
    result: ExtractionResult,
) -> bool:
    if result.extraction_tier == "degraded" or result.line_items:
        return False
    normalized_transcript = result.transcript.strip()
    if len(normalized_transcript) < _SEMANTIC_EMPTY_LINE_ITEMS_MIN_TRANSCRIPT_CHARS:
        return False
    return len(normalized_transcript.split()) >= _SEMANTIC_EMPTY_LINE_ITEMS_MIN_WORDS


def _should_warn_for_total_without_priced_items(result: ExtractionResult) -> bool:
    return (
        result.total is not None
        and bool(result.line_items)
        and not any(item.price is not None for item in result.line_items)
    )


def _apply_duplicate_line_item_flags(
    line_items: list[LineItemExtracted],
    confidence_notes: list[str],
) -> list[LineItemExtracted]:
    duplicate_groups: dict[tuple[str, float | None], list[int]] = {}
    for index, item in enumerate(line_items):
        normalized_description = _normalize_line_item_description(item.description)
        if not normalized_description:
            continue
        key = (normalized_description, item.price)
        duplicate_groups.setdefault(key, []).append(index)

    duplicate_indexes = sorted(
        index for indexes in duplicate_groups.values() if len(indexes) > 1 for index in indexes
    )
    if not duplicate_indexes:
        return line_items

    _append_semantic_note(confidence_notes, _SEMANTIC_NOTE_DUPLICATE_LINE_ITEMS)
    updated_items = list(line_items)
    for index in duplicate_indexes:
        existing = updated_items[index]
        updated_items[index] = existing.model_copy(
            update={
                "flagged": True,
                "flag_reason": existing.flag_reason or _SEMANTIC_FLAG_REASON_DUPLICATE_LINE_ITEM,
            }
        )
    return updated_items


def _normalize_line_item_description(value: str) -> str:
    collapsed_whitespace = _WHITESPACE_PATTERN.sub(" ", value.strip())
    return collapsed_whitespace.casefold()


def _append_semantic_note(confidence_notes: list[str], note: str) -> None:
    if note in confidence_notes:
        return
    if len(confidence_notes) >= CONFIDENCE_NOTES_MAX_ITEMS:
        return
    confidence_notes.append(note)
