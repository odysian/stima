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
    SPOKEN_MONEY_CORRECTION_FLAG_REASON,
    AppendExtractionCandidate,
    AppendUnresolvedItem,
    CaptureSegment,
    CaptureSegmentHints,
    ExtractionMode,
    ExtractionResult,
    ExtractionSuggestion,
    InitialExtractionCandidate,
    LineItemExtractedV2,
    PreparedCaptureInput,
    PricingCandidates,
    PricingHints,
    SpokenMoneyHint,
    UnresolvedItem,
    UnresolvedSegment,
    UnresolvedSegmentSource,
)
from app.shared.extraction_logger import log_extraction_trace
from app.shared.input_limits import (
    DOCUMENT_LINE_ITEMS_MAX_ITEMS,
    EXTRACTION_TRANSCRIPT_MAX_CHARS,
    LINE_ITEM_DESCRIPTION_MAX_CHARS,
    LINE_ITEM_DETAILS_MAX_CHARS,
)
from app.shared.observability import log_provider_quota_exhausted, log_provider_retry

EXTRACTION_TOOL_NAME = "extract_quote"
_LINE_ITEM_SCHEMA: dict[str, Any] = {
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
}

_PRICING_CANDIDATES_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "explicit_total": {"type": ["number", "null"]},
        "deposit_amount": {"type": ["number", "null"]},
        "tax_rate": {"type": ["number", "null"]},
        "discount_type": {"type": ["string", "null"], "enum": ["fixed", "percent", None]},
        "discount_value": {"type": ["number", "null"]},
    },
    "additionalProperties": False,
}

EXTRACTION_TOOL_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "line_items": {
            "type": "array",
            "maxItems": DOCUMENT_LINE_ITEMS_MAX_ITEMS,
            "items": _LINE_ITEM_SCHEMA,
        },
        "notes_candidate": {
            "type": ["string", "null"],
            "maxLength": LINE_ITEM_DETAILS_MAX_CHARS,
        },
        "pricing_candidates": _PRICING_CANDIDATES_SCHEMA,
        "unresolved_items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "maxLength": EXTRACTION_TRANSCRIPT_MAX_CHARS,
                    },
                    "reason": {
                        "type": "string",
                        "enum": [
                            "ambiguous_scope",
                            "possible_conflict",
                            "unplaced_content",
                        ],
                    },
                },
                "required": ["text", "reason"],
                "additionalProperties": False,
            },
        },
    },
    "required": [
        "line_items",
        "notes_candidate",
        "pricing_candidates",
        "unresolved_items",
    ],
    "additionalProperties": False,
}

APPEND_EXTRACTION_TOOL_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "new_line_items": {
            "type": "array",
            "maxItems": DOCUMENT_LINE_ITEMS_MAX_ITEMS,
            "items": _LINE_ITEM_SCHEMA,
        },
        "notes_candidate": {
            "type": ["string", "null"],
            "maxLength": LINE_ITEM_DETAILS_MAX_CHARS,
        },
        "pricing_candidates": _PRICING_CANDIDATES_SCHEMA,
        "unresolved_items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "maxLength": EXTRACTION_TRANSCRIPT_MAX_CHARS,
                    },
                    "reason": {
                        "type": "string",
                        "enum": [
                            "ambiguous_scope",
                            "possible_conflict",
                            "unplaced_content",
                            "correction",
                        ],
                    },
                },
                "required": ["text", "reason"],
                "additionalProperties": False,
            },
        },
    },
    "required": [
        "new_line_items",
        "notes_candidate",
        "pricing_candidates",
        "unresolved_items",
    ],
    "additionalProperties": False,
}

EXTRACTION_SYSTEM_PROMPT = (
    "Extract quote line items, pricing candidates, and unresolved capture details from structured "
    "capture input. "
    "Do not invent pricing. Use null for missing values. "
    "Set line-item flagged=true only for strong review signals: likely audio mishears, "
    "clearly implausible single-item prices, or critically ambiguous quantity/unit phrasing. "
    "When flagged=true, include a short flag_reason. Keep flagged false otherwise. "
    "Use notes_candidate only when a short customer-facing note should be seeded. "
    "Return only structured tool output."
)

APPEND_EXTRACTION_SYSTEM_PROMPT = (
    "Extract append-only quote candidates from structured capture input. "
    "Return only additive new_line_items; do not rewrite or restate existing scope. "
    "Route corrective/removal/replacement language to unresolved_items with reason='correction'. "
    "Use notes_candidate and pricing_candidates only for additive candidates that could fill empty "
    "visible fields. "
    "Do not invent pricing. Use null for missing values. "
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
_SEMANTIC_UNRESOLVED_TOTAL_WITHOUT_PRICED_ITEMS = (
    "Explicit total was extracted without priced line items; verify pricing details."
)
_SEMANTIC_FLAG_REASON_DUPLICATE_LINE_ITEM = "Possible duplicate line item from extraction output"
_UNRESOLVED_REASON_TO_SOURCE: dict[str, str] = {
    "ambiguous_scope": "leftover_classification",
    "possible_conflict": "transcript_conflict",
    "unplaced_content": "leftover_classification",
}
_APPEND_UNRESOLVED_REASON_TO_SOURCE: dict[str, str] = {
    "ambiguous_scope": "leftover_classification",
    "possible_conflict": "transcript_conflict",
    "unplaced_content": "leftover_classification",
    "correction": "transcript_conflict",
}
_LEGACY_UNRESOLVED_SOURCE_TO_REASON: dict[str, str] = {
    "leftover_classification": "unplaced_content",
    "typed_conflict": "possible_conflict",
    "transcript_conflict": "possible_conflict",
}
_WHITESPACE_PATTERN = re.compile(r"\s+")
_BLANK_LINE_SPLIT_PATTERN = re.compile(r"\n\s*\n+")
_BULLET_PREFIX_PATTERN = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+")
_HEADING_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9 /\-]{0,40}:\s*$")
_NOTES_HEADING_PATTERN = re.compile(r"^\s*notes?\s*:\s*$", re.IGNORECASE)
_PRICE_PATTERN = re.compile(r"\$?\s*(\d+(?:\.\d{1,2})?)")
_EXPLICIT_PRICE_MARKER_PATTERN = re.compile(
    r"(\$|usd\b|dollars?\b|bucks?\b|price\b|total\b)",
    re.IGNORECASE,
)
_WORD_TOKEN_PATTERN = re.compile(r"[a-z]+(?:'[a-z]+)?")

_SPOKEN_MONEY_ONES: dict[str, int] = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
}
_SPOKEN_MONEY_TEENS: dict[str, int] = {
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
}
_SPOKEN_MONEY_TENS: dict[str, int] = {
    "twenty": 20,
    "thirty": 30,
    "forty": 40,
    "fifty": 50,
    "sixty": 60,
    "seventy": 70,
    "eighty": 80,
    "ninety": 90,
}
_SPOKEN_MONEY_ADJACENCY_SKIP = frozenset(
    {
        "am",
        "pm",
        "o'clock",
        "morning",
        "afternoon",
        "pound",
        "pounds",
        "gallon",
        "gallons",
        "foot",
        "feet",
        "inch",
        "inches",
        "percent",
        "street",
        "st",
        "ave",
        "avenue",
        "road",
        "rd",
        "bags",
        "drums",
    }
)
_SPOKEN_MONEY_TIME_VERBS = frozenset(
    {
        "arrive",
        "arrived",
        "arriving",
        "meet",
        "meets",
        "meeting",
        "met",
        "call",
        "calls",
        "called",
    }
)
_SPOKEN_MONEY_CONTEXT_PREPOSITIONS = frozenset({"is", "for", "at"})
_SPOKEN_MONEY_CONTEXT_KEYWORDS = frozenset(
    {
        "price",
        "priced",
        "cost",
        "costs",
        "charge",
        "charges",
        "total",
        "dollar",
        "dollars",
        "buck",
        "bucks",
        "quote",
        "quoted",
        "amount",
    }
)
_SPOKEN_MONEY_NON_CONTEXT_TENS = frozenset({"thirty", "forty"})

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


@dataclass(frozen=True, slots=True)
class _SpokenMoneyHint:
    phrase: str
    amount: float
    start_token_index: int
    end_token_index: int


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

    async def extract(
        self,
        capture_input: PreparedCaptureInput | str,
        *,
        mode: ExtractionMode = "initial",
    ) -> ExtractionResult:
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
                    mode=mode,
                    tier=tier,
                )
            except ExtractionError as exc:
                last_error = exc
                log_extraction_trace(
                    _TRACE_EVENT_NAME,
                    stage=tier.tier,
                    outcome="failed",
                    level=logging.WARNING,
                    extraction_mode=mode,
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
            extraction_mode=mode,
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
        mode: ExtractionMode,
        tier: _ExtractionTierConfig,
    ) -> ExtractionResult:
        request_content = _build_extraction_request(prepared_input, mode=mode)
        tool_schema = APPEND_EXTRACTION_TOOL_SCHEMA if mode == "append" else EXTRACTION_TOOL_SCHEMA
        system_prompt = (
            APPEND_EXTRACTION_SYSTEM_PROMPT if mode == "append" else EXTRACTION_SYSTEM_PROMPT
        )
        log_extraction_trace(
            _TRACE_EVENT_NAME,
            stage=tier.tier,
            outcome="started",
            extraction_mode=mode,
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
            tool_schema=tool_schema,
            system_prompt=system_prompt,
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
        candidate_payload = (
            _coerce_append_candidate_payload(payload)
            if mode == "append"
            else _coerce_initial_candidate_payload(payload)
        )
        line_item_field = "new_line_items" if mode == "append" else "line_items"
        log_extraction_trace(
            _TRACE_EVENT_NAME,
            stage=tier.tier,
            outcome="provider_response",
            extraction_mode=mode,
            extraction_model_id=response_model_id,
            extraction_prompt_variant=tier.prompt_variant,
            token_input_tokens=_token_usage_value(response_token_usage, "input_tokens"),
            token_output_tokens=_token_usage_value(response_token_usage, "output_tokens"),
            line_item_count=_list_count(candidate_payload.get(line_item_field)),
            unresolved_item_count=_list_count(candidate_payload.get("unresolved_items")),
            notes_candidate_present=bool(candidate_payload.get("notes_candidate")),
            total_present=(
                _pricing_candidates_payload(candidate_payload.get("pricing_candidates")).get(
                    "explicit_total"
                )
                is not None
            ),
            raw_transcript=prepared_input.transcript,
            raw_tool_payload=candidate_payload,
        )

        try:
            if mode == "append":
                validated_append_candidate = AppendExtractionCandidate.model_validate(
                    candidate_payload
                )
                result = _build_extraction_result_from_append_candidate(
                    candidate=validated_append_candidate,
                    transcript=prepared_input.transcript,
                )
            else:
                validated_initial_candidate = InitialExtractionCandidate.model_validate(
                    candidate_payload
                )
                result = _build_extraction_result_from_candidate(
                    candidate=validated_initial_candidate,
                    transcript=prepared_input.transcript,
                )
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
                raw_tool_payload=candidate_payload,
            )
            try:
                repair_response = await self._request_with_retry(
                    typed_client,
                    _build_repair_request(
                        notes=request_content,
                        invalid_payload=candidate_payload,
                        validation_errors=validation_errors,
                    ),
                    model_id=tier.model_id,
                    invocation_tier=tier.tier,
                    prompt_variant=repair_prompt_variant,
                    tool_schema=tool_schema,
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
            repair_candidate_payload = (
                _coerce_append_candidate_payload(repair_payload)
                if mode == "append"
                else _coerce_initial_candidate_payload(repair_payload)
            )
            try:
                if mode == "append":
                    repaired_append_candidate = AppendExtractionCandidate.model_validate(
                        repair_candidate_payload
                    )
                else:
                    repaired_initial_candidate = InitialExtractionCandidate.model_validate(
                        repair_candidate_payload
                    )
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
                    raw_tool_payload=repair_candidate_payload,
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
                line_item_count=_list_count(repair_candidate_payload.get(line_item_field)),
                unresolved_item_count=_list_count(repair_candidate_payload.get("unresolved_items")),
                notes_candidate_present=bool(repair_candidate_payload.get("notes_candidate")),
                total_present=(
                    _pricing_candidates_payload(
                        repair_candidate_payload.get("pricing_candidates")
                    ).get("explicit_total")
                    is not None
                ),
                raw_transcript=prepared_input.transcript,
                raw_tool_payload=repair_candidate_payload,
            )
            if mode == "append":
                result = _build_extraction_result_from_append_candidate(
                    candidate=repaired_append_candidate,
                    transcript=prepared_input.transcript,
                )
            else:
                result = _build_extraction_result_from_candidate(
                    candidate=repaired_initial_candidate,
                    transcript=prepared_input.transcript,
                )
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
        tool_schema: dict[str, Any],
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
                                "Extract quote line items, pricing candidates, optional notes "
                                "candidate, and unresolved items."
                            ),
                            "input_schema": tool_schema,
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


def _build_extraction_request(
    prepared_input: PreparedCaptureInput,
    *,
    mode: ExtractionMode,
) -> str:
    segments = _segment_capture_input(prepared_input.transcript)
    if mode == "append":
        mode_instructions = {
            "line_item_rule": (
                "Return only additive new_line_items. Do not rewrite, remove, or replace "
                "existing visible quote scope."
            ),
            "notes_candidate_rule": (
                "Use notes_candidate only for additive context that can fill an empty notes field."
            ),
            "pricing_rule": (
                "Use pricing_candidates only for additive pricing directives that can fill empty "
                "visible pricing fields."
            ),
            "correction_rule": (
                "Corrective/removal/replacement language belongs in unresolved_items with "
                "reason='correction', not in new_line_items."
            ),
        }
    else:
        mode_instructions = {
            "line_item_description_rule": (
                "Use short customer-facing labels; move remainder to details."
            ),
            "pricing_rule": (
                "Do not invent pricing. "
                "Use pricing_candidates for explicit pricing directives only."
            ),
            "notes_candidate_rule": (
                "Use notes_candidate only for concise customer-facing notes; otherwise null."
            ),
            "unresolved_items_rule": (
                "Use unresolved_items for ambiguous or conflicting content that needs review."
            ),
        }
    request_payload = {
        "extraction_mode": mode,
        "prepared_capture_input": prepared_input.model_dump(mode="json"),
        "capture_segments": [segment.model_dump(mode="json") for segment in segments],
        "instructions": mode_instructions,
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
    spoken_money_hints = [
        SpokenMoneyHint(phrase=hint.phrase, amount=hint.amount)
        for hint in _extract_spoken_money_hints(normalized_text)
    ]
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
        spoken_money_hints=spoken_money_hints,
    )


def _parse_price_value(candidate: str) -> float | None:
    try:
        return float(candidate)
    except ValueError:
        return None


def _extract_spoken_money_hints(text: str) -> list[_SpokenMoneyHint]:
    tokens = list(_WORD_TOKEN_PATTERN.finditer(text.casefold()))
    if not tokens:
        return []

    words = [token.group(0) for token in tokens]
    hints: list[_SpokenMoneyHint] = []
    seen: set[tuple[int, int, float]] = set()

    for start_index in range(len(words)):
        parsed = _parse_spoken_money_phrase(words, start_index)
        if parsed is None:
            continue
        amount, end_index, is_extreme_shape = parsed
        if _has_spoken_money_adjacency_skip(
            words=words,
            start=start_index,
            end=end_index,
        ):
            continue
        if _looks_like_time_or_non_money_phrase(
            words=words,
            start=start_index,
            end=end_index,
        ):
            continue
        has_money_context = _has_spoken_money_context(
            words=words,
            start=start_index,
            end=end_index,
        )
        if not has_money_context and not is_extreme_shape:
            continue
        key = (start_index, end_index, float(amount))
        if key in seen:
            continue
        seen.add(key)
        hints.append(
            _SpokenMoneyHint(
                phrase=" ".join(words[start_index:end_index]),
                amount=float(amount),
                start_token_index=start_index,
                end_token_index=end_index,
            )
        )
    return hints


def _parse_spoken_money_phrase(
    words: list[str],
    start: int,
) -> tuple[int, int, bool] | None:
    if start + 1 >= len(words):
        return None

    first = words[start]
    second = words[start + 1]

    if first in _SPOKEN_MONEY_ONES and second in _SPOKEN_MONEY_TENS:
        amount = (_SPOKEN_MONEY_ONES[first] * 100) + _SPOKEN_MONEY_TENS[second]
        end = start + 2
        if end < len(words) and words[end] in _SPOKEN_MONEY_ONES:
            amount += _SPOKEN_MONEY_ONES[words[end]]
            end += 1
        is_extreme_shape = second not in _SPOKEN_MONEY_NON_CONTEXT_TENS
        return amount, end, is_extreme_shape

    prefix = _parse_spoken_under_hundred(words, start)
    if prefix is None:
        return None
    prefix_value, prefix_consumed = prefix
    hundred_index = start + prefix_consumed
    if hundred_index >= len(words) or words[hundred_index] != "hundred":
        return None

    amount = prefix_value * 100
    end = hundred_index + 1
    suffix = _parse_spoken_under_hundred(words, end)
    if suffix is not None:
        suffix_value, suffix_consumed = suffix
        amount += suffix_value
        end += suffix_consumed
    return amount, end, True


def _parse_spoken_under_hundred(words: list[str], start: int) -> tuple[int, int] | None:
    if start >= len(words):
        return None
    token = words[start]
    if token in _SPOKEN_MONEY_TEENS:
        return _SPOKEN_MONEY_TEENS[token], 1
    if token in _SPOKEN_MONEY_TENS:
        value = _SPOKEN_MONEY_TENS[token]
        consumed = 1
        next_index = start + 1
        if next_index < len(words) and words[next_index] in _SPOKEN_MONEY_ONES:
            value += _SPOKEN_MONEY_ONES[words[next_index]]
            consumed += 1
        return value, consumed
    if token in _SPOKEN_MONEY_ONES:
        return _SPOKEN_MONEY_ONES[token], 1
    return None


def _has_spoken_money_context(*, start: int, end: int, words: list[str]) -> bool:
    if start > 0 and words[start - 1] in _SPOKEN_MONEY_CONTEXT_PREPOSITIONS:
        return True
    if end < len(words) and words[end] in {"total", "dollars", "bucks"}:
        return True

    context_start = max(0, start - 3)
    context_end = min(len(words), end + 3)
    return any(word in _SPOKEN_MONEY_CONTEXT_KEYWORDS for word in words[context_start:context_end])


def _has_spoken_money_adjacency_skip(*, start: int, end: int, words: list[str]) -> bool:
    previous_word = words[start - 1] if start > 0 else None
    next_word = words[end] if end < len(words) else None
    next_next_word = words[end + 1] if end + 1 < len(words) else None

    if previous_word in _SPOKEN_MONEY_ADJACENCY_SKIP:
        return True
    if next_word in _SPOKEN_MONEY_ADJACENCY_SKIP:
        return True
    if next_word == "bucks" and next_next_word == "per":
        return True
    if next_next_word in {"street", "st", "avenue", "ave", "road", "rd"}:
        return True
    return False


def _looks_like_time_or_non_money_phrase(*, start: int, end: int, words: list[str]) -> bool:
    previous_word = words[start - 1] if start > 0 else None
    previous_two_word = words[start - 2] if start > 1 else None
    next_word = words[end] if end < len(words) else None

    if previous_word in {"around", "about"}:
        return True
    if next_word in {"am", "pm", "o'clock", "morning", "afternoon"}:
        return True
    if previous_word == "at" and previous_two_word in _SPOKEN_MONEY_TIME_VERBS:
        return True
    return False


def _coerce_initial_candidate_payload(payload: dict[str, Any]) -> dict[str, Any]:
    normalized_payload = dict(payload)
    normalized_payload.setdefault("line_items", [])
    normalized_payload["line_items"] = _normalize_initial_line_item_payloads(
        normalized_payload.get("line_items")
    )

    pricing_candidates = normalized_payload.get("pricing_candidates")
    if not isinstance(pricing_candidates, dict):
        legacy_hints = normalized_payload.get("pricing_hints")
        if isinstance(legacy_hints, dict):
            pricing_candidates = dict(legacy_hints)
        else:
            pricing_candidates = {}
        if (
            "explicit_total" not in pricing_candidates
            and normalized_payload.get("total") is not None
        ):
            pricing_candidates["explicit_total"] = normalized_payload.get("total")
    normalized_payload["pricing_candidates"] = pricing_candidates

    notes_candidate = normalized_payload.get("notes_candidate")
    if not isinstance(notes_candidate, str):
        notes_candidate = None
        legacy_notes = normalized_payload.get("customer_notes_suggestion")
        if isinstance(legacy_notes, dict):
            legacy_text = legacy_notes.get("text")
            if isinstance(legacy_text, str):
                notes_candidate = legacy_text
    normalized_payload["notes_candidate"] = notes_candidate

    unresolved_items = normalized_payload.get("unresolved_items")
    if not isinstance(unresolved_items, list):
        unresolved_items = []
        legacy_unresolved = normalized_payload.get("unresolved_segments")
        if isinstance(legacy_unresolved, list):
            for item in legacy_unresolved:
                if not isinstance(item, dict):
                    continue
                text = item.get("raw_text")
                if not isinstance(text, str) or not text.strip():
                    continue
                source = item.get("source")
                reason = (
                    _LEGACY_UNRESOLVED_SOURCE_TO_REASON.get(source)
                    if isinstance(source, str)
                    else None
                )
                unresolved_items.append(
                    {
                        "text": text,
                        "reason": reason or "unplaced_content",
                    }
                )
    normalized_payload["unresolved_items"] = unresolved_items
    return normalized_payload


def _coerce_append_candidate_payload(payload: dict[str, Any]) -> dict[str, Any]:
    normalized_payload = dict(payload)
    normalized_payload.setdefault("new_line_items", [])
    normalized_payload["new_line_items"] = _normalize_initial_line_item_payloads(
        normalized_payload.get("new_line_items")
    )
    normalized_payload["pricing_candidates"] = _pricing_candidates_payload(
        normalized_payload.get("pricing_candidates")
    )
    notes_candidate = normalized_payload.get("notes_candidate")
    if not isinstance(notes_candidate, str):
        notes_candidate = None
    normalized_payload["notes_candidate"] = notes_candidate

    unresolved_items = normalized_payload.get("unresolved_items")
    if not isinstance(unresolved_items, list):
        unresolved_items = []
    normalized_payload["unresolved_items"] = unresolved_items
    return normalized_payload


def _build_extraction_result_from_candidate(
    *,
    candidate: InitialExtractionCandidate,
    transcript: str,
) -> ExtractionResult:
    notes_candidate = (candidate.notes_candidate or "").strip()
    unresolved_segments = [
        _to_unresolved_segment(unresolved_item) for unresolved_item in candidate.unresolved_items
    ]
    result = ExtractionResult(
        transcript=transcript,
        pipeline_version="v2.5",
        line_items=[
            LineItemExtractedV2(
                raw_text=(line_item.details or line_item.description).strip()
                or line_item.description,
                confidence="medium",
                description=line_item.description,
                details=line_item.details,
                price=line_item.price,
                flagged=line_item.flagged,
                flag_reason=line_item.flag_reason,
            )
            for line_item in candidate.line_items
        ],
        pricing_hints=PricingHints.model_validate(
            candidate.pricing_candidates.model_dump(mode="json")
        ),
        customer_notes_suggestion=(
            ExtractionSuggestion(
                text=notes_candidate,
                confidence="medium",
                source="leftover_classification",
            )
            if notes_candidate
            else None
        ),
        unresolved_segments=unresolved_segments,
    )
    return _apply_semantic_guard_rules(result)


def _build_extraction_result_from_append_candidate(
    *,
    candidate: AppendExtractionCandidate,
    transcript: str,
) -> ExtractionResult:
    notes_candidate = (candidate.notes_candidate or "").strip()
    unresolved_segments = [
        _to_append_unresolved_segment(unresolved_item)
        for unresolved_item in candidate.unresolved_items
    ]
    result = ExtractionResult(
        transcript=transcript,
        pipeline_version="v2.5",
        line_items=[
            LineItemExtractedV2(
                raw_text=(line_item.details or line_item.description).strip()
                or line_item.description,
                confidence="medium",
                description=line_item.description,
                details=line_item.details,
                price=line_item.price,
                flagged=line_item.flagged,
                flag_reason=line_item.flag_reason,
            )
            for line_item in candidate.new_line_items
        ],
        pricing_hints=PricingHints.model_validate(
            candidate.pricing_candidates.model_dump(mode="json")
        ),
        customer_notes_suggestion=(
            ExtractionSuggestion(
                text=notes_candidate,
                confidence="medium",
                source="leftover_classification",
            )
            if notes_candidate
            else None
        ),
        unresolved_segments=unresolved_segments,
    )
    return _apply_semantic_guard_rules(result)


def _to_unresolved_segment(item: UnresolvedItem) -> UnresolvedSegment:
    source = _UNRESOLVED_REASON_TO_SOURCE.get(item.reason, "leftover_classification")
    confidence: Literal["medium", "low"] = "medium" if item.reason == "possible_conflict" else "low"
    return UnresolvedSegment(
        raw_text=item.text.strip(),
        confidence=confidence,
        source=cast(UnresolvedSegmentSource, source),
    )


def _to_append_unresolved_segment(item: AppendUnresolvedItem) -> UnresolvedSegment:
    source = _APPEND_UNRESOLVED_REASON_TO_SOURCE.get(item.reason, "leftover_classification")
    confidence: Literal["medium", "low"] = (
        "medium" if item.reason in {"possible_conflict", "correction"} else "low"
    )
    return UnresolvedSegment(
        raw_text=item.text.strip(),
        confidence=confidence,
        source=cast(UnresolvedSegmentSource, source),
    )


def _normalize_initial_line_item_payloads(value: object) -> object:
    if not isinstance(value, list):
        return value

    normalized_items: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        normalized_item = dict(item)
        normalized_item.setdefault("flagged", False)
        normalized_item.setdefault("flag_reason", None)
        normalized_items.append(normalized_item)
    return normalized_items


def _pricing_candidates_payload(value: object) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return PricingCandidates().model_dump(mode="json")


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
    capture_segments = getattr(result, "capture_segments", ())
    spoken_money_hint_count = sum(
        len(segment.hints.spoken_money_hints) for segment in capture_segments
    )
    spoken_money_correction_count = sum(
        1 for item in result.line_items if item.flag_reason == SPOKEN_MONEY_CORRECTION_FLAG_REASON
    )
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
        flagged_line_item_count=sum(1 for item in result.line_items if item.flagged),
        spoken_money_hint_count=spoken_money_hint_count,
        spoken_money_correction_count=spoken_money_correction_count,
        unresolved_segment_count=len(result.unresolved_segments),
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
        pipeline_version="v2.5",
        line_items=[],
        pricing_hints=PricingHints(),
        customer_notes_suggestion=None,
        unresolved_segments=[],
        extraction_tier="degraded",
        extraction_degraded_reason_code=EXTRACTION_DEGRADED_REASON_VALIDATION_REPAIR_FAILED,
    )


def _apply_semantic_guard_rules(result: ExtractionResult) -> ExtractionResult:
    """Apply incident-informed semantic checks after schema validation succeeds.

    Rule outcomes are intentionally constrained:
    - Empty line items + substantial transcript -> degraded reason code.
    - Explicit total without priced line items -> unresolved actionable item.
    - Duplicate/price token/duplicate-details -> visible line-item flags only.
    """

    line_items = list(result.line_items)
    unresolved_segments = list(result.unresolved_segments)
    extraction_tier = result.extraction_tier
    degraded_reason_code = result.extraction_degraded_reason_code

    if _should_degrade_for_empty_line_items_with_substantial_transcript(result):
        extraction_tier = "degraded"
        degraded_reason_code = SEMANTIC_DEGRADED_REASON_EMPTY_LINE_ITEMS_SUBSTANTIAL_TRANSCRIPT

    if _should_warn_for_total_without_priced_items(result):
        unresolved_segments = _append_semantic_unresolved_segment(
            unresolved_segments,
            text=_SEMANTIC_UNRESOLVED_TOTAL_WITHOUT_PRICED_ITEMS,
            source="leftover_classification",
        )

    line_items = _apply_spoken_money_correction_guard(
        line_items=line_items,
        transcript=result.transcript,
    )
    line_items = _flag_line_items_with_price_in_description(line_items)
    line_items = _flag_line_items_with_duplicate_details(line_items)
    line_items = _apply_duplicate_line_item_flags(line_items)

    return result.model_copy(
        update={
            "line_items": line_items,
            "unresolved_segments": unresolved_segments,
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
        result.pricing_hints.explicit_total is not None
        and bool(result.line_items)
        and not any(item.price is not None for item in result.line_items)
    )


def _apply_spoken_money_correction_guard(
    *,
    line_items: list[LineItemExtractedV2],
    transcript: str,
) -> list[LineItemExtractedV2]:
    if not line_items:
        return line_items

    spoken_hints = _extract_spoken_money_hints(transcript)
    if not spoken_hints:
        return line_items

    updated_items = list(line_items)
    used_indexes: set[int] = set()

    for hint in spoken_hints:
        matched_index = _resolve_spoken_money_match_index(
            line_items=updated_items,
            hint=hint,
            used_indexes=used_indexes,
        )
        if matched_index is None:
            log_extraction_trace(
                _TRACE_EVENT_NAME,
                stage="semantic_guard",
                outcome="spoken_money_orphan_hint",
                spoken_money_phrase=hint.phrase,
                spoken_money_amount=hint.amount,
            )
            continue

        used_indexes.add(matched_index)
        existing = updated_items[matched_index]
        if _prices_materially_equal(existing.price, hint.amount):
            continue
        if not _looks_like_cents_hundreds_misread(existing.price, hint.amount):
            continue

        updated_items[matched_index] = existing.model_copy(
            update={
                "price": hint.amount,
                "flagged": True,
                "flag_reason": SPOKEN_MONEY_CORRECTION_FLAG_REASON,
            }
        )

    return updated_items


def _resolve_spoken_money_match_index(
    *,
    line_items: list[LineItemExtractedV2],
    hint: _SpokenMoneyHint,
    used_indexes: set[int],
) -> int | None:
    phrase_matches: list[int] = []
    cents_misread_matches: list[int] = []

    for index, item in enumerate(line_items):
        if index in used_indexes:
            continue
        if _hint_phrase_matches_line_item(item=item, hint_phrase=hint.phrase):
            phrase_matches.append(index)
            continue
        if _looks_like_cents_hundreds_misread(item.price, hint.amount):
            cents_misread_matches.append(index)

    if phrase_matches:
        return phrase_matches[0]
    if len(cents_misread_matches) == 1:
        return cents_misread_matches[0]
    return None


def _hint_phrase_matches_line_item(
    *,
    item: LineItemExtractedV2,
    hint_phrase: str,
) -> bool:
    line_item_text = " ".join(
        part
        for part in (
            item.raw_text,
            item.description,
            item.details,
        )
        if part
    )
    normalized_line_item = _WHITESPACE_PATTERN.sub(" ", line_item_text).strip().casefold()
    return hint_phrase in normalized_line_item


def _looks_like_cents_hundreds_misread(
    candidate_price: float | None,
    hint_amount: float,
) -> bool:
    if candidate_price is None:
        return False
    if hint_amount < 100:
        return False
    return abs((candidate_price * 100) - hint_amount) < 0.01


def _prices_materially_equal(left: float | None, right: float | None) -> bool:
    if left is None or right is None:
        return left is None and right is None
    return abs(left - right) < 0.01


def _apply_duplicate_line_item_flags(
    line_items: list[LineItemExtractedV2],
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
) -> list[LineItemExtractedV2]:
    flagged_indexes = [
        index for index, item in enumerate(line_items) if _should_flag_price_tokens_for_item(item)
    ]
    if not flagged_indexes:
        return line_items

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


def _append_semantic_unresolved_segment(
    unresolved_segments: list[UnresolvedSegment],
    *,
    text: str,
    source: UnresolvedSegmentSource,
) -> list[UnresolvedSegment]:
    normalized_text = text.strip()
    if any(
        segment.raw_text.strip().casefold() == normalized_text.casefold()
        and segment.source == source
        for segment in unresolved_segments
    ):
        return unresolved_segments
    return [
        *unresolved_segments,
        UnresolvedSegment(
            raw_text=normalized_text,
            confidence="medium",
            source=source,
        ),
    ]


def _should_flag_price_tokens_for_item(item: LineItemExtractedV2) -> bool:
    tokens = _price_tokens_in_text(item.description)
    if not tokens:
        return False

    if item.price is not None and any(
        _prices_materially_equal(token, item.price) for token in tokens
    ):
        return False

    has_explicit_price_marker = _EXPLICIT_PRICE_MARKER_PATTERN.search(item.description) is not None
    if item.price is not None and len(tokens) == 1 and not has_explicit_price_marker:
        return False

    return True


def _price_tokens_in_text(text: str) -> list[float]:
    tokens: list[float] = []
    for match in _PRICE_PATTERN.finditer(text):
        candidate = _parse_price_value(match.group(1))
        if candidate is None:
            continue
        tokens.append(candidate)
    return tokens
