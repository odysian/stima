"""OpenAI transcription integration for converting WAV audio to text."""

from __future__ import annotations

import asyncio
import secrets
from typing import Any, cast

import openai
from openai import AsyncOpenAI

from app.shared.observability import log_provider_quota_exhausted, log_provider_retry

_RETRY_BASE_DELAY_SECONDS = 0.25
_RETRY_MAX_DELAY_SECONDS = 2.0
TRANSCRIPTION_PROMPT_CONTRACTOR_PRICE_SHORTHAND = (
    "Transcribe contractor quote notes verbatim. Preserve spoken price shorthand as words. "
    'Write contractor shorthand like "four fifty" and "one twenty five" as words, '
    'not as "$4.50" or "$1.25". Only write "$4.50" when the speaker explicitly '
    'says "four dollars and fifty cents".'
)


class TranscriptionError(Exception):
    """Raised when voice transcription cannot produce usable text."""


class TranscriptionIntegration:
    """Transcribe normalized WAV audio via OpenAI's transcription API."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        timeout_seconds: float = 30.0,
        max_attempts: int = 3,
        client: object | None = None,
        prompt: str = TRANSCRIPTION_PROMPT_CONTRACTOR_PRICE_SHORTHAND,
    ) -> None:
        self._api_key = api_key
        self._model = model
        self._timeout_seconds = timeout_seconds
        self._max_attempts = max_attempts
        self._client = client
        self._prompt = prompt

    async def transcribe(self, audio_wav: bytes) -> str:
        """Return normalized transcript text from WAV bytes."""
        if not audio_wav:
            raise TranscriptionError("Transcription audio payload is empty")

        if self._client is None:
            if not self._api_key:
                raise TranscriptionError("Transcription API key is not configured")
            self._client = AsyncOpenAI(
                api_key=self._api_key,
                timeout=self._timeout_seconds,
                max_retries=0,
            )

        client = self._client
        if client is None:  # pragma: no cover - defensive invariant
            raise TranscriptionError("OpenAI transcription client was not initialized")

        typed_client = cast(Any, client)

        response = await self._request_with_retry(typed_client, audio_wav)

        transcript_text = _extract_text(response)
        if not transcript_text:
            raise TranscriptionError("Transcription response was empty")

        return transcript_text

    async def _request_with_retry(self, typed_client: Any, audio_wav: bytes) -> object:
        last_error: Exception | None = None
        for attempt in range(1, self._max_attempts + 1):
            try:
                return await typed_client.audio.transcriptions.create(
                    model=self._model,
                    file=("audio.wav", audio_wav, "audio/wav"),
                    prompt=self._prompt,
                )
            except Exception as exc:
                last_error = exc
                upstream_status = _provider_status_code(exc)
                if attempt >= self._max_attempts or not _is_retryable_provider_error(exc):
                    if upstream_status == 429:
                        log_provider_quota_exhausted(
                            provider="openai",
                            upstream_status=upstream_status,
                            attempt=attempt,
                            max_attempts=self._max_attempts,
                        )
                    break
                retry_delay_seconds = _retry_delay_seconds(attempt)
                if upstream_status == 429:
                    log_provider_retry(
                        provider="openai",
                        upstream_status=upstream_status,
                        attempt=attempt,
                        max_attempts=self._max_attempts,
                        backoff_ms=int(retry_delay_seconds * 1000),
                    )
                await asyncio.sleep(retry_delay_seconds)

        if last_error is None:  # pragma: no cover - defensive invariant
            raise TranscriptionError("OpenAI transcription request failed")
        raise TranscriptionError(
            f"OpenAI transcription request failed: {last_error}"
        ) from last_error


def _extract_text(response: object) -> str:
    text = getattr(response, "text", None)
    if isinstance(text, str):
        return text.strip()

    if isinstance(response, dict):
        response_text = response.get("text")
        if isinstance(response_text, str):
            return response_text.strip()

    return ""


def _is_retryable_provider_error(exc: Exception) -> bool:
    if isinstance(
        exc,
        (
            openai.APIConnectionError,
            openai.APITimeoutError,
            asyncio.TimeoutError,
            TimeoutError,
        ),
    ):
        return True
    if isinstance(exc, openai.RateLimitError):
        return True
    if isinstance(exc, openai.InternalServerError):
        return True
    if isinstance(exc, openai.APIStatusError):
        return getattr(exc, "status_code", 0) >= 500
    return False


def _provider_status_code(exc: Exception) -> int | None:
    status_code = getattr(exc, "status_code", None)
    if isinstance(status_code, int):
        return status_code
    if isinstance(exc, openai.RateLimitError):
        return 429
    return None


def _retry_delay_seconds(attempt: int) -> float:
    base_delay = min(_RETRY_BASE_DELAY_SECONDS * (2 ** (attempt - 1)), _RETRY_MAX_DELAY_SECONDS)
    jitter_bound = min(0.1, base_delay / 2)
    if jitter_bound <= 0:
        return base_delay
    return base_delay + (secrets.randbelow(1000) / 1000) * jitter_bound
