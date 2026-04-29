"""Transcription integration tests for OpenAI response handling."""

from __future__ import annotations

import httpx
import openai
import pytest
from app.integrations.transcription import TranscriptionError, TranscriptionIntegration

pytestmark = pytest.mark.asyncio


class _FakeTranscriptions:
    def __init__(self) -> None:
        self.response: object = type("Response", (), {"text": " transcript "})()
        self.should_raise = False
        self.calls: list[dict[str, object]] = []

    async def create(self, **kwargs: object) -> object:
        self.calls.append(kwargs)
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
    client = _FakeClient()
    integration = TranscriptionIntegration(api_key="test", model="whisper-1", client=client)

    transcript = await integration.transcribe(b"wav-bytes")

    assert transcript == "transcript"  # nosec B101
    assert client.transcriptions.calls  # nosec B101
    assert "prompt" in client.transcriptions.calls[0]  # nosec B101


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


async def test_transcribe_builds_client_with_configured_timeout_and_disabled_sdk_retries(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured_kwargs: dict[str, object] = {}

    class _FakeOpenAIClient:
        def __init__(self, **kwargs: object) -> None:
            captured_kwargs.update(kwargs)
            self.transcriptions = _FakeTranscriptions()
            self.audio = _FakeAudio(self.transcriptions)

    monkeypatch.setattr("app.integrations.transcription.AsyncOpenAI", _FakeOpenAIClient)
    integration = TranscriptionIntegration(
        api_key="test",
        model="whisper-1",
        timeout_seconds=12.5,
    )

    transcript = await integration.transcribe(b"wav-bytes")

    assert transcript == "transcript"  # nosec B101
    assert captured_kwargs["timeout"] == 12.5  # nosec B101
    assert captured_kwargs["max_retries"] == 0  # nosec B101


async def test_transcribe_retries_timeout_then_succeeds(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.integrations.transcription.secrets.randbelow", lambda *_: 0)
    sleep_calls: list[float] = []

    async def _fake_sleep(delay: float) -> None:
        sleep_calls.append(delay)

    monkeypatch.setattr("app.integrations.transcription.asyncio.sleep", _fake_sleep)
    request = httpx.Request("POST", "https://api.openai.com/v1/audio/transcriptions")
    timeout_error = openai.APITimeoutError(request=request)
    client = _FakeClient()
    outcomes = iter([timeout_error, type("Response", (), {"text": " transcript "})()])

    async def _create(**_: object) -> object:
        outcome = next(outcomes)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    client.transcriptions.create = _create  # type: ignore[method-assign]
    integration = TranscriptionIntegration(
        api_key="test",
        model="whisper-1",
        max_attempts=2,
        client=client,
    )

    transcript = await integration.transcribe(b"wav-bytes")

    assert transcript == "transcript"  # nosec B101
    assert sleep_calls == [0.25]  # nosec B101
