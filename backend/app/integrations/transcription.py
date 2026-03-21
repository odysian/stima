"""OpenAI transcription integration for converting WAV audio to text."""

from __future__ import annotations

from typing import Any, cast

from openai import AsyncOpenAI


class TranscriptionError(Exception):
    """Raised when voice transcription cannot produce usable text."""


class TranscriptionIntegration:
    """Transcribe normalized WAV audio via OpenAI's transcription API."""

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

    async def transcribe(self, audio_wav: bytes) -> str:
        """Return normalized transcript text from WAV bytes."""
        if not audio_wav:
            raise TranscriptionError("Transcription audio payload is empty")

        if self._client is None:
            if not self._api_key:
                raise TranscriptionError("Transcription API key is not configured")
            self._client = AsyncOpenAI(api_key=self._api_key)

        client = self._client
        if client is None:  # pragma: no cover - defensive invariant
            raise TranscriptionError("OpenAI transcription client was not initialized")

        typed_client = cast(Any, client)

        try:
            response = await typed_client.audio.transcriptions.create(
                model=self._model,
                file=("audio.wav", audio_wav, "audio/wav"),
            )
        except Exception as exc:  # pragma: no cover - provider-level failures
            raise TranscriptionError(f"OpenAI transcription request failed: {exc}") from exc

        transcript_text = _extract_text(response)
        if not transcript_text:
            raise TranscriptionError("Transcription response was empty")

        return transcript_text


def _extract_text(response: object) -> str:
    text = getattr(response, "text", None)
    if isinstance(text, str):
        return text.strip()

    if isinstance(response, dict):
        response_text = response.get("text")
        if isinstance(response_text, str):
            return response_text.strip()

    return ""
