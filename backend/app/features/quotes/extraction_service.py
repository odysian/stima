"""Quote extraction orchestration."""

from __future__ import annotations

import asyncio
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

import sentry_sdk

from app.features.quotes.schemas import ExtractionResult
from app.features.quotes.service import QuoteServiceError
from app.integrations.audio import AudioClip, AudioError
from app.integrations.extraction import ExtractionError
from app.integrations.transcription import TranscriptionError
from app.shared.event_logger import log_event


class ExtractionIntegrationProtocol(Protocol):
    """Structural protocol for extraction integration dependency."""

    async def extract(self, notes: str) -> ExtractionResult: ...


class AudioIntegrationProtocol(Protocol):
    """Structural protocol for audio normalization integration dependency."""

    def normalize_and_stitch(self, clips: Sequence[AudioClip]) -> bytes: ...


class TranscriptionIntegrationProtocol(Protocol):
    """Structural protocol for speech-to-text integration dependency."""

    async def transcribe(self, audio_wav: bytes) -> str: ...


@dataclass(slots=True)
class CaptureAudioClip:
    """Internal clip payload used by service orchestration."""

    filename: str | None
    content_type: str | None
    content: bytes


class ExtractionService:
    """Coordinate audio/transcription/extraction integrations for quote intake."""

    def __init__(
        self,
        *,
        extraction_integration: ExtractionIntegrationProtocol,
        audio_integration: AudioIntegrationProtocol,
        transcription_integration: TranscriptionIntegrationProtocol,
    ) -> None:
        self._extraction = extraction_integration
        self._audio = audio_integration
        self._transcription = transcription_integration

    async def convert_notes(self, notes: str) -> ExtractionResult:
        """Extract structured line items from freeform notes."""
        try:
            return await self._extraction.extract(notes)
        except ExtractionError as exc:
            sentry_sdk.capture_exception(exc)
            raise QuoteServiceError(
                detail=f"Extraction failed: {exc}",
                status_code=422,
            ) from exc

    async def capture_audio(self, clips: Sequence[CaptureAudioClip]) -> ExtractionResult:
        """Normalize uploaded clips, transcribe audio, and extract quote line items."""
        transcript = await self._transcribe_clips(clips)
        return await self.convert_notes(transcript)

    async def extract_combined(
        self,
        clips: Sequence[CaptureAudioClip] | None,
        notes: str | None,
        *,
        user_id: UUID | None = None,
    ) -> ExtractionResult:
        """Extract quote line items from optional clips plus optional typed notes."""
        normalized_notes = (notes or "").strip()
        has_clips = bool(clips)
        if not has_clips and not normalized_notes:
            raise QuoteServiceError(
                detail="Provide at least one audio clip or typed notes.",
                status_code=400,
            )

        source_type = (
            "audio+notes" if has_clips and normalized_notes else "audio" if has_clips else "notes"
        )
        log_event("quote_started", user_id=user_id, detail=source_type)
        if has_clips:
            log_event("audio_uploaded", user_id=user_id, detail=source_type)

        combined_text = normalized_notes
        try:
            if clips:
                transcript = await self._transcribe_clips(clips)
                combined_text = transcript
                if normalized_notes:
                    combined_text = f"{transcript}\n\n{normalized_notes}"

            extraction = await self.convert_notes(combined_text)
        except QuoteServiceError:
            log_event("draft_generation_failed", user_id=user_id, detail=source_type)
            raise

        log_event("draft_generated", user_id=user_id, detail=source_type)
        return extraction

    async def _transcribe_clips(self, clips: Sequence[CaptureAudioClip]) -> str:
        """Normalize clip uploads and return the resulting transcript."""
        try:
            stitched_wav = await asyncio.to_thread(
                self._audio.normalize_and_stitch,
                [
                    AudioClip(
                        filename=clip.filename,
                        content_type=clip.content_type,
                        content=clip.content,
                    )
                    for clip in clips
                ],
            )
        except AudioError as exc:
            sentry_sdk.capture_exception(exc)
            raise QuoteServiceError(detail=str(exc), status_code=400) from exc

        try:
            return await self._transcription.transcribe(stitched_wav)
        except TranscriptionError as exc:
            sentry_sdk.capture_exception(exc)
            raise QuoteServiceError(
                detail=f"Transcription failed: {exc}",
                status_code=502,
            ) from exc
