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

from app.features.quotes.schemas import (
    CaptureSegment,
    CaptureSegmentHints,
    ExtractionResult,
    ExtractionResultV2,
    LineItemExtractedV2,
    PreparedCaptureInput,
    PricingHints,
)
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
        "pipeline_version": {"type": "string", "enum": ["v2"]},
        "line_items": {
            "type": "array",
            "maxItems": DOCUMENT_LINE_ITEMS_MAX_ITEMS,
            "items": {
                "type": "object",
                "properties": {
                    "raw_text": {
                        "type": "string",
                        "maxLength": EXTRACTION_TRANSCRIPT_MAX_CHARS,
                    },
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
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                },
                "required": ["raw_text", "description", "confidence"],
                "additionalProperties": False,
            },
        },
        "pricing_hints": {
            "type": "object",
            "properties": {
                "explicit_total": {"type": ["number", "null"]},
                "deposit_amount": {"type": ["number", "null"]},
                "tax_rate": {"type": ["number", "null"]},
                "discount_type": {"type": ["string", "null"], "enum": ["fixed", "percent", None]},
                "discount_value": {"type": ["number", "null"]},
            },
            "additionalProperties": False,
        },
        "customer_notes_suggestion": {
            "type": ["object", "null"],
            "properties": {
                "text": {
                    "type": "string",
                    "maxLength": LINE_ITEM_DETAILS_MAX_CHARS,
                },
                "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                "source": {
                    "type": "string",
                    "enum": [
                        "leftover_classification",
                        "typed_conflict",
                        "transcript_conflict",
                    ],
                },
            },
            "required": ["text", "confidence", "source"],
            "additionalProperties": False,
        },
        "unresolved_segments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "raw_text": {
                        "type": "string",
                        "maxLength": EXTRACTION_TRANSCRIPT_MAX_CHARS,
                    },
                    "confidence": {"type": "string", "enum": ["medium", "low"]},
                    "source": {
                        "type": "string",
                        "enum": [
                            "leftover_classification",
                            "typed_conflict",
                            "transcript_conflict",
                        ],
                    },
                },
                "required": ["raw_text", "confidence", "source"],
                "additionalProperties": False,
            },
        },
        "confidence_notes": {
            "type": "array",
            "maxItems": CONFIDENCE_NOTES_MAX_ITEMS,
            "items": {
                "type": "string",
                "maxLength": CONFIDENCE_NOTE_MAX_CHARS,
            },
        },
    },
    "required": [
        "transcript",
        "pipeline_version",
        "line_items",
        "pricing_hints",
        "customer_notes_suggestion",
        "unresolved_segments",
        "confidence_notes",
    ],
    "additionalProperties": False,
}

EXTRACTION_SYSTEM_PROMPT = (
    "Extract quote line items, pricing hints, and unresolved capture details from structured "
    "capture input. "
    "Do not invent pricing. Use null for missing values and keep confidence_notes sparse "
    "and operator-relevant. "
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
    "Explicit total was extracted without any priced line items; review pricing details."
)
_SEMANTIC_NOTE_DUPLICATE_LINE_ITEMS = (
    "Duplicate extracted line items were detected and flagged for review."
)
_SEMANTIC_FLAG_REASON_DUPLICATE_LINE_ITEM = "Possible duplicate line item from extraction output"
_WHITESPACE_PATTERN = re.compile(r"\s+")
_BLANK_LINE_SPLIT_PATTERN = re.compile(r"\n\s*\n+")
_BULLET_PREFIX_PATTERN = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+")
_HEADING_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9 /\-]{0,40}:\s*$")
_NOTES_HEADING_PATTERN = re.compile(r"^\s*notes?\s*:\s*$", re.IGNORECASE)
_PRICE_PATTERN = re.compile(r"\$?\s*(\d+(?:\.\d{1,2})?)")

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

    async def extract(self, capture_input: PreparedCaptureInput | str) -> ExtractionResult:
        """Call Claude structured output and validate the V2 contract."""
        prepared_input = _coerce_prepared_capture_input(capture_input)
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
                    prepared_input,
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
        prepared_input: PreparedCaptureInput,
        *,
        tier: _ExtractionTierConfig,
    ) -> ExtractionResult:
        request_content = _build_extraction_request(prepared_input)
        log_extraction_trace(
            _TRACE_EVENT_NAME,
            stage=tier.tier,
            outcome="started",
            extraction_model_id=tier.model_id,
            extraction_prompt_variant=tier.prompt_variant,
            transcript_chars=len(prepared_input.transcript),
            raw_transcript=prepared_input.transcript,
        )
        _set_last_call_metadata(
            model_id=tier.model_id,
            token_usage=None,
            invocation_tier=tier.tier,
            prompt_variant=tier.prompt_variant,
        )

        response = await self._request_with_retry(
            typed_client,
            request_content,
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
        payload.setdefault("transcript", prepared_input.transcript)
        payload.setdefault("pipeline_version", "v2")
        payload.setdefault("line_items", [])
        payload.setdefault("pricing_hints", {})
        payload.setdefault("customer_notes_suggestion", None)
        payload.setdefault("unresolved_segments", [])
        payload.setdefault("confidence_notes", [])
        payload["line_items"] = _normalize_line_item_payloads(payload.get("line_items"))
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
            total_present=(
                _pricing_hints_payload(payload.get("pricing_hints")).get("explicit_total")
                is not None
            ),
            raw_transcript=prepared_input.transcript,
            raw_tool_payload=payload,
        )

        try:
            validated_result_v2 = ExtractionResultV2.model_validate(payload)
            guarded_result_v2 = _apply_semantic_guard_rules(validated_result_v2)
            result = ExtractionResult.model_validate(guarded_result_v2.model_dump(mode="json"))
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
                raw_transcript=prepared_input.transcript,
                raw_tool_payload=payload,
            )
            try:
                repair_response = await self._request_with_retry(
                    typed_client,
                    _build_repair_request(
                        notes=request_content,
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
            repair_payload.setdefault("transcript", prepared_input.transcript)
            repair_payload.setdefault("pipeline_version", "v2")
            repair_payload.setdefault("line_items", [])
            repair_payload.setdefault("pricing_hints", {})
            repair_payload.setdefault("customer_notes_suggestion", None)
            repair_payload.setdefault("unresolved_segments", [])
            repair_payload.setdefault("confidence_notes", [])
            repair_payload["line_items"] = _normalize_line_item_payloads(
                repair_payload.get("line_items")
            )
            try:
                repaired_result_v2 = ExtractionResultV2.model_validate(repair_payload)
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
                    raw_transcript=prepared_input.transcript,
                    raw_tool_payload=repair_payload,
                )
                degraded_result = _build_validation_repair_failed_result(
                    transcript=prepared_input.transcript
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
                    _pricing_hints_payload(repair_payload.get("pricing_hints")).get(
                        "explicit_total"
                    )
                    is not None
                ),
                raw_transcript=prepared_input.transcript,
                raw_tool_payload=repair_payload,
            )
            guarded_result_v2 = _apply_semantic_guard_rules(repaired_result_v2)
            result = ExtractionResult.model_validate(guarded_result_v2.model_dump(mode="json"))
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
                                "Extract quote line items, pricing hints, unresolved segments, "
                                "optional customer-notes suggestion, and sparse confidence notes."
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


def _coerce_prepared_capture_input(
    capture_input: PreparedCaptureInput | str,
) -> PreparedCaptureInput:
    if isinstance(capture_input, PreparedCaptureInput):
        return capture_input
    normalized_text = capture_input.strip()
    if not normalized_text:
        raise ExtractionError("notes cannot be empty")
    return PreparedCaptureInput.from_legacy_transcript(
        transcript=normalized_text,
        source_type="text",
    )


def _build_extraction_request(prepared_input: PreparedCaptureInput) -> str:
    segments = _segment_capture_input(prepared_input.transcript)
    request_payload = {
        "prepared_capture_input": prepared_input.model_dump(mode="json"),
        "capture_segments": [segment.model_dump(mode="json") for segment in segments],
        "instructions": {
            "line_item_description_rule": (
                "Use short customer-facing labels; move remainder to details."
            ),
            "pricing_rule": (
                "Do not invent pricing. Use pricing_hints for explicit pricing directives only."
            ),
            "confidence_notes_rule": "Only include sparse, operator-relevant review notes.",
        },
    }
    return json.dumps(request_payload, ensure_ascii=True, separators=(",", ":"))


def _segment_capture_input(transcript: str) -> list[CaptureSegment]:
    stripped = transcript.strip()
    if not stripped:
        return []

    chunks: list[str] = []
    for block in _BLANK_LINE_SPLIT_PATTERN.split(stripped):
        block_text = block.strip()
        if not block_text:
            continue
        lines = [line.strip() for line in block_text.splitlines() if line.strip()]
        if not lines:
            continue
        if len(lines) == 1:
            chunks.append(lines[0])
            continue
        chunks.extend(lines)

    segments: list[CaptureSegment] = []
    for index, raw_text in enumerate(chunks):
        normalized_text = _normalize_segment_text(raw_text)
        hints = _build_segment_hints(raw_text=raw_text, normalized_text=normalized_text)
        segments.append(
            CaptureSegment(
                index=index,
                raw_text=raw_text,
                normalized_text=normalized_text,
                hints=hints,
            )
        )
    return segments


def _normalize_segment_text(text: str) -> str:
    normalized = _WHITESPACE_PATTERN.sub(" ", text.strip())
    normalized = re.sub(r"\bw/\b", "with", normalized, flags=re.IGNORECASE)
    normalized = normalized.replace("+", " and ")
    return _WHITESPACE_PATTERN.sub(" ", normalized).strip()


def _build_segment_hints(*, raw_text: str, normalized_text: str) -> CaptureSegmentHints:
    explicit_price_match = _PRICE_PATTERN.search(raw_text)
    price_value = (
        _parse_price_value(explicit_price_match.group(1)) if explicit_price_match else None
    )
    looks_like_heading = _HEADING_PATTERN.match(raw_text) is not None
    looks_like_notes_heading = _NOTES_HEADING_PATTERN.match(raw_text) is not None
    looks_like_line_item = _BULLET_PREFIX_PATTERN.match(raw_text) is not None or (
        price_value is not None and not looks_like_heading
    )
    return CaptureSegmentHints(
        has_explicit_price=price_value is not None,
        price_value=price_value,
        looks_like_heading=looks_like_heading,
        looks_like_notes_heading=looks_like_notes_heading,
        looks_like_line_item=looks_like_line_item,
    )


def _parse_price_value(candidate: str) -> float | None:
    try:
        return float(candidate)
    except ValueError:
        return None


def _normalize_line_item_payloads(value: object) -> object:
    if not isinstance(value, list):
        return value

    normalized_items: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        normalized_item = dict(item)
        description = normalized_item.get("description")
        normalized_item.setdefault(
            "raw_text",
            (
                description
                if isinstance(description, str) and description.strip()
                else "Unspecified item"
            ),
        )
        normalized_item.setdefault("confidence", "medium")
        normalized_items.append(normalized_item)
    return normalized_items


def _pricing_hints_payload(value: object) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return PricingHints().model_dump(mode="json")


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
        total_present=result.pricing_hints.explicit_total is not None,
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
        pipeline_version="v2",
        line_items=[],
        pricing_hints=PricingHints(),
        customer_notes_suggestion=None,
        unresolved_segments=[],
        confidence_notes=[],
        extraction_tier="degraded",
        extraction_degraded_reason_code=EXTRACTION_DEGRADED_REASON_VALIDATION_REPAIR_FAILED,
    )


def _apply_semantic_guard_rules(result: ExtractionResultV2) -> ExtractionResultV2:
    """Apply incident-informed semantic checks after schema validation succeeds.

    Rule outcomes are intentionally constrained:
    - Empty line items + substantial transcript -> degraded (allowlisted structural failure).
    - Explicit total without priced line items -> warning note only (tier remains primary).
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

    line_items = _flag_line_items_with_price_in_description(line_items, confidence_notes)
    line_items = _flag_line_items_with_duplicate_details(line_items, confidence_notes)
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
    result: ExtractionResultV2,
) -> bool:
    if result.extraction_tier == "degraded" or result.line_items:
        return False
    normalized_transcript = result.transcript.strip()
    if len(normalized_transcript) < _SEMANTIC_EMPTY_LINE_ITEMS_MIN_TRANSCRIPT_CHARS:
        return False
    return len(normalized_transcript.split()) >= _SEMANTIC_EMPTY_LINE_ITEMS_MIN_WORDS


def _should_warn_for_total_without_priced_items(result: ExtractionResultV2) -> bool:
    return (
        result.pricing_hints.explicit_total is not None
        and bool(result.line_items)
        and not any(item.price is not None for item in result.line_items)
    )


def _apply_duplicate_line_item_flags(
    line_items: list[LineItemExtractedV2],
    confidence_notes: list[str],
) -> list[LineItemExtractedV2]:
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


def _flag_line_items_with_price_in_description(
    line_items: list[LineItemExtractedV2],
    confidence_notes: list[str],
) -> list[LineItemExtractedV2]:
    flagged_indexes = [
        index for index, item in enumerate(line_items) if _contains_price_token(item.description)
    ]
    if not flagged_indexes:
        return line_items

    _append_semantic_note(
        confidence_notes,
        "Line-item descriptions should not include price tokens; review flagged items.",
    )
    updated_items = list(line_items)
    for index in flagged_indexes:
        current = updated_items[index]
        updated_items[index] = current.model_copy(
            update={
                "flagged": True,
                "flag_reason": current.flag_reason or "Description includes price tokens",
            }
        )
    return updated_items


def _flag_line_items_with_duplicate_details(
    line_items: list[LineItemExtractedV2],
    confidence_notes: list[str],
) -> list[LineItemExtractedV2]:
    flagged_indexes = [
        index
        for index, item in enumerate(line_items)
        if item.details is not None
        and _normalize_line_item_description(item.details)
        == _normalize_line_item_description(item.description)
    ]
    if not flagged_indexes:
        return line_items

    _append_semantic_note(
        confidence_notes,
        "Some line-item details duplicate the description; review flagged items.",
    )
    updated_items = list(line_items)
    for index in flagged_indexes:
        current = updated_items[index]
        updated_items[index] = current.model_copy(
            update={
                "flagged": True,
                "flag_reason": current.flag_reason or "Details duplicate description",
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


def _contains_price_token(text: str) -> bool:
    return _PRICE_PATTERN.search(text) is not None
