"""Transcription integration tests for OpenAI response handling."""

from __future__ import annotations

import pytest
from app.integrations.transcription import TranscriptionError, TranscriptionIntegration

pytestmark = pytest.mark.asyncio


class _FakeTranscriptions:
    def __init__(self) -> None:
        self.response: object = type("Response", (), {"text": " transcript "})()
        self.should_raise = False

    async def create(self, **_: object) -> object:
        if self.should_raise:
            raise RuntimeError("provider unavailable")
        return self.response


class _FakeAudio:
    def __init__(self, transcriptions: _FakeTranscriptions) -> None:
        self.transcriptions = transcriptions


class _FakeClient:
    def __init__(self) -> None:
        self.transcriptions = _FakeTranscriptions()
        self.audio = _FakeAudio(self.transcriptions)


async def test_transcribe_rejects_empty_audio_payload() -> None:
    integration = TranscriptionIntegration(api_key="test", model="whisper-1", client=_FakeClient())

    with pytest.raises(TranscriptionError, match="audio payload is empty"):
        await integration.transcribe(b"")


async def test_transcribe_returns_trimmed_text() -> None:
    integration = TranscriptionIntegration(api_key="test", model="whisper-1", client=_FakeClient())

    transcript = await integration.transcribe(b"wav-bytes")

    assert transcript == "transcript"  # nosec B101


async def test_transcribe_rejects_missing_text_response() -> None:
    client = _FakeClient()
    client.transcriptions.response = {}
    integration = TranscriptionIntegration(api_key="test", model="whisper-1", client=client)

    with pytest.raises(TranscriptionError, match="response was empty"):
        await integration.transcribe(b"wav-bytes")


async def test_transcribe_wraps_provider_failures() -> None:
    client = _FakeClient()
    client.transcriptions.should_raise = True
    integration = TranscriptionIntegration(api_key="test", model="whisper-1", client=client)

    with pytest.raises(TranscriptionError, match="OpenAI transcription request failed"):
        await integration.transcribe(b"wav-bytes")
