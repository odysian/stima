"""Extraction service unit tests for error capture boundaries."""

from __future__ import annotations

from collections.abc import Sequence

import pytest
import sentry_sdk

from app.features.quotes.extraction_service import CaptureAudioClip, ExtractionService
from app.features.quotes.schemas import ExtractionResult
from app.features.quotes.service import QuoteServiceError
from app.integrations.audio import AudioClip, AudioError
from app.integrations.extraction import ExtractionError
from app.integrations.transcription import TranscriptionError
from app.shared.input_limits import (
    AUDIO_TRANSCRIPT_MAX_CHARS,
    DOCUMENT_TRANSCRIPT_MAX_CHARS,
    NOTE_INPUT_MAX_CHARS,
)

pytestmark = pytest.mark.asyncio


class _FailingExtractionIntegration:
    async def extract(self, notes: str) -> ExtractionResult:
        del notes
        raise ExtractionError("mock extraction failure")


class _FailingAudioIntegration:
    def normalize_and_stitch(self, clips: Sequence[AudioClip]) -> bytes:
        del clips
        raise AudioError("mock audio failure")


class _FailingTranscriptionIntegration:
    async def transcribe(self, audio_wav: bytes) -> str:
        del audio_wav
        raise TranscriptionError("mock transcription failure")


class _SuccessfulAudioIntegration:
    def normalize_and_stitch(self, clips: Sequence[AudioClip]) -> bytes:
        del clips
        return b"stitched-audio"


class _SuccessfulExtractionIntegration:
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def extract(self, notes: str) -> ExtractionResult:
        self.calls.append(notes)
        return ExtractionResult(
            transcript=notes,
            line_items=[],
            confidence_notes=[],
        )


class _SuccessfulTranscriptionIntegration:
    def __init__(self, transcript: str = "transcript from stitched-audio") -> None:
        self.transcript = transcript

    async def transcribe(self, audio_wav: bytes) -> str:
        del audio_wav
        return self.transcript


async def test_convert_notes_captures_extraction_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: list[BaseException] = []
    monkeypatch.setattr(sentry_sdk, "capture_exception", captured.append)
    service = ExtractionService(
        extraction_integration=_FailingExtractionIntegration(),
        audio_integration=_SuccessfulAudioIntegration(),
        transcription_integration=_FailingTranscriptionIntegration(),
    )

    with pytest.raises(QuoteServiceError, match="Extraction failed"):
        await service.convert_notes("mulch and edging")

    assert len(captured) == 1
    assert isinstance(captured[0], ExtractionError)


async def test_capture_audio_captures_audio_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: list[BaseException] = []
    monkeypatch.setattr(sentry_sdk, "capture_exception", captured.append)
    service = ExtractionService(
        extraction_integration=_FailingExtractionIntegration(),
        audio_integration=_FailingAudioIntegration(),
        transcription_integration=_FailingTranscriptionIntegration(),
    )

    with pytest.raises(QuoteServiceError, match="mock audio failure"):
        await service.capture_audio([_clip()])

    assert len(captured) == 1
    assert isinstance(captured[0], AudioError)


async def test_capture_audio_captures_transcription_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[BaseException] = []
    monkeypatch.setattr(sentry_sdk, "capture_exception", captured.append)
    service = ExtractionService(
        extraction_integration=_FailingExtractionIntegration(),
        audio_integration=_SuccessfulAudioIntegration(),
        transcription_integration=_FailingTranscriptionIntegration(),
    )

    with pytest.raises(QuoteServiceError, match="Transcription failed"):
        await service.capture_audio([_clip()])

    assert len(captured) == 1
    assert isinstance(captured[0], TranscriptionError)


async def test_extract_combined_allows_audio_and_notes_up_to_document_limit() -> None:
    extraction = _SuccessfulExtractionIntegration()
    transcript = "t" * AUDIO_TRANSCRIPT_MAX_CHARS
    notes = "n" * NOTE_INPUT_MAX_CHARS
    service = ExtractionService(
        extraction_integration=extraction,
        audio_integration=_SuccessfulAudioIntegration(),
        transcription_integration=_SuccessfulTranscriptionIntegration(transcript),
    )

    result = await service.extract_combined([_clip()], notes)

    expected_transcript = f"{transcript}\n\n{notes}"
    assert extraction.calls == [expected_transcript]
    assert result.transcript == expected_transcript
    assert len(result.transcript) == DOCUMENT_TRANSCRIPT_MAX_CHARS


def _clip() -> CaptureAudioClip:
    return CaptureAudioClip(
        filename="sample.wav",
        content_type="audio/wav",
        content=b"audio-bytes",
    )
