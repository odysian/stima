"""Quote extraction orchestration."""

from __future__ import annotations

import asyncio
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal, Protocol
from uuid import UUID

import sentry_sdk

from app.features.quotes.extraction_outcomes import (
    build_degraded_extraction_result,
    log_draft_generation_failed_event,
    should_persist_degraded_retryable_error,
)
from app.features.quotes.schemas import ExtractionResult, PreparedCaptureInput
from app.features.quotes.service import QuoteServiceError
from app.integrations.audio import AudioClip, AudioError
from app.integrations.extraction import ExtractionError
from app.integrations.transcription import TranscriptionError
from app.shared.event_logger import log_event
from app.shared.input_limits import (
    AUDIO_TRANSCRIPT_MAX_CHARS,
    EXTRACTION_TRANSCRIPT_MAX_CHARS,
)


class ExtractionIntegrationProtocol(Protocol):
    """Structural protocol for extraction integration dependency."""

    async def extract(self, capture_input: PreparedCaptureInput) -> ExtractionResult: ...


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
        prepared_input = PreparedCaptureInput.from_legacy_transcript(
            transcript=notes,
            source_type="text",
        )
        return await self._extract_prepared_input(prepared_input)

    async def prepare_capture_input(
        self,
        clips: Sequence[CaptureAudioClip] | None,
        notes: str | None,
        *,
        user_id: UUID | None = None,
    ) -> PreparedCaptureInput:
        """Normalize capture input into structured transcript + provenance."""
        normalized_notes = (notes or "").strip()
        has_clips = bool(clips)
        if not has_clips and not normalized_notes:
            raise QuoteServiceError(
                detail="Provide at least one audio clip or typed notes.",
                status_code=400,
            )

        capture_detail = (
            "audio+notes" if has_clips and normalized_notes else "audio" if has_clips else "notes"
        )
        log_event("quote_started", user_id=user_id, detail=capture_detail)
        if has_clips:
            log_event("audio_uploaded", user_id=user_id, detail=capture_detail)

        raw_transcript: str | None = None
        combined_text = normalized_notes
        if clips:
            raw_transcript = await self._transcribe_clips(clips)
            combined_text = raw_transcript
            if normalized_notes:
                combined_text = f"{raw_transcript}\n\n{normalized_notes}"

        _validate_transcript_length(
            combined_text,
            max_chars=EXTRACTION_TRANSCRIPT_MAX_CHARS,
        )
        source_type: Literal["text", "voice", "voice+text"]
        if raw_transcript is not None and normalized_notes:
            source_type = "voice+text"
        elif raw_transcript is not None:
            source_type = "voice"
        else:
            source_type = "text"
        return PreparedCaptureInput(
            transcript=combined_text,
            source_type=source_type,
            raw_typed_notes=normalized_notes or None,
            raw_transcript=raw_transcript,
        )

    async def prepare_combined_transcript(
        self,
        clips: Sequence[CaptureAudioClip] | None,
        notes: str | None,
        *,
        user_id: UUID | None = None,
    ) -> str:
        """Return the flattened transcript string for compatibility call sites."""
        prepared_input = await self.prepare_capture_input(
            clips,
            notes,
            user_id=user_id,
        )
        return prepared_input.transcript

    async def extract_combined(
        self,
        clips: Sequence[CaptureAudioClip] | None,
        notes: str | None,
        *,
        user_id: UUID | None = None,
        allow_degraded_persist_on_retryable_failure: bool = False,
    ) -> ExtractionResult:
        """Extract quote line items from optional clips plus optional typed notes."""
        try:
            prepared_input = await self.prepare_capture_input(
                clips,
                notes,
                user_id=user_id,
            )
            try:
                extraction = await self._extract_prepared_input(prepared_input)
            except QuoteServiceError as exc:
                should_persist_degraded = (
                    allow_degraded_persist_on_retryable_failure
                    and should_persist_degraded_retryable_error(
                        exc,
                        is_final_attempt=True,
                    )
                )
                if should_persist_degraded:
                    return build_degraded_extraction_result(transcript=prepared_input.transcript)
                raise
        except QuoteServiceError:
            source_type = (
                "audio+notes" if clips and (notes or "").strip() else "audio" if clips else "notes"
            )
            if user_id is not None:
                log_draft_generation_failed_event(user_id=user_id, capture_detail=source_type)
            raise
        return extraction

    async def _extract_prepared_input(
        self,
        prepared_input: PreparedCaptureInput,
    ) -> ExtractionResult:
        try:
            return await self._extraction.extract(prepared_input)
        except ExtractionError as exc:
            sentry_sdk.capture_exception(exc)
            raise QuoteServiceError(
                detail=f"Extraction failed: {exc}",
                status_code=422,
            ) from exc

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
            transcript = await self._transcription.transcribe(stitched_wav)
        except TranscriptionError as exc:
            sentry_sdk.capture_exception(exc)
            raise QuoteServiceError(
                detail=f"Transcription failed: {exc}",
                status_code=502,
            ) from exc
        _validate_transcript_length(
            transcript,
            max_chars=AUDIO_TRANSCRIPT_MAX_CHARS,
        )
        return transcript


def _validate_transcript_length(transcript: str, *, max_chars: int) -> None:
    if len(transcript) <= max_chars:
        return
    raise QuoteServiceError(
        detail=f"Transcript exceeds maximum length of {max_chars} characters",
        status_code=422,
    )
