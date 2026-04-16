from __future__ import annotations

from collections.abc import Sequence
from types import SimpleNamespace
from typing import TypedDict

from app.features.quotes.repository import QuoteRenderContext
from app.features.quotes.schemas import (
    ExtractionMode,
    ExtractionResult,
    LineItemExtractedV2,
    PreparedCaptureInput,
    PricingHints,
)
from app.integrations.audio import AudioClip, AudioError
from app.integrations.email import EmailConfigurationError, EmailMessage, EmailSendError
from app.integrations.extraction import ExtractionError
from app.integrations.storage import StorageNotFoundError
from app.integrations.transcription import TranscriptionError
from app.shared.idempotency import IdempotencyBeginResult


class _MockExtractionIntegration:
    async def extract(
        self,
        notes: PreparedCaptureInput | str,
        *,
        mode: ExtractionMode = "initial",
    ) -> ExtractionResult:
        del mode
        normalized_notes = _capture_transcript(notes)
        if "malformed" in normalized_notes.lower():
            raise ExtractionError("mock malformed extraction payload")

        if "needs-review" in normalized_notes.lower() or normalized_notes.startswith(
            "transcript from stitched"
        ):
            return ExtractionResult(
                transcript=normalized_notes,
                line_items=[
                    LineItemExtractedV2(
                        raw_text="Brown mulch 5 yards 120",
                        description="Brown mulch",
                        details="5 yards",
                        price=120,
                        price_status="priced",
                        flagged=True,
                        flag_reason="Unit or price sounds inconsistent with the transcript",
                        confidence="medium",
                    )
                ],
                pricing_hints=PricingHints(explicit_total=120),
            )

        return ExtractionResult(
            transcript=normalized_notes,
            line_items=[
                LineItemExtractedV2(
                    raw_text="Brown mulch 5 yards 120",
                    description="Brown mulch",
                    details="5 yards",
                    price=120,
                    price_status="priced",
                    confidence="medium",
                )
            ],
            pricing_hints=PricingHints(explicit_total=120),
        )


def _capture_transcript(notes: PreparedCaptureInput | str) -> str:
    if isinstance(notes, PreparedCaptureInput):
        return notes.transcript.strip()
    return notes.strip()


class _MockPdfIntegration:
    def render(self, context: QuoteRenderContext) -> bytes:
        return f"PDF for {context.doc_number}".encode()


class _MockAudioIntegration:
    def normalize_and_stitch(self, clips: Sequence[AudioClip]) -> bytes:
        if not clips:
            raise AudioError("At least one audio clip is required")

        if any(len(clip.content) == 0 for clip in clips):
            raise AudioError("Audio clip is empty")

        if any(clip.content == b"unsupported" for clip in clips):
            raise AudioError("Audio clip format is not supported or file is corrupted")

        if any(clip.content == b"trigger-transcription-error" for clip in clips):
            return b"trigger-transcription-error"

        return f"stitched-{len(clips)}".encode()


class _MockTranscriptionIntegration:
    async def transcribe(self, audio_wav: bytes) -> str:
        if audio_wav == b"trigger-transcription-error":
            raise TranscriptionError("mock transcription outage")
        return f"transcript from {audio_wav.decode()}"


class _MockStorageService:
    def fetch_bytes(self, object_path: str) -> bytes:
        raise StorageNotFoundError(object_path)

    def upload(
        self,
        *,
        prefix: str,
        filename: str,
        data: bytes,
        content_type: str,
    ) -> str:
        del data
        del content_type
        return f"{prefix.strip('/')}/{filename.lstrip('/')}"

    def delete(self, object_path: str) -> None:
        del object_path


class _MockEmailService:
    def __init__(self) -> None:
        self.messages: list[EmailMessage] = []
        self.raise_configuration_error = False
        self.raise_send_error = False

    async def send(self, message: EmailMessage) -> None:
        if self.raise_configuration_error:
            raise EmailConfigurationError("Email delivery is not configured")
        if self.raise_send_error:
            raise EmailSendError("Provider failure")
        self.messages.append(message)


class _FailingAbortIdempotencyStore:
    async def begin(self, **_: object) -> IdempotencyBeginResult:
        return IdempotencyBeginResult(kind="started")

    async def abort(self, **_: object) -> None:
        raise RuntimeError("redis unavailable")

    async def complete(self, **_: object) -> None:
        return None


class _InProgressIdempotencyStore:
    async def begin(self, **_: object) -> IdempotencyBeginResult:
        return IdempotencyBeginResult(kind="in_progress")

    async def abort(self, **_: object) -> None:
        return None

    async def complete(self, **_: object) -> None:
        return None


class _MockArqPool:
    class _EnqueueCall(TypedDict):
        function: str
        args: tuple[object, ...]
        kwargs: dict[str, object]

    def __init__(self) -> None:
        self.calls: list[_MockArqPool._EnqueueCall] = []

    async def enqueue_job(self, function: str, *args: object, **kwargs: object) -> object:
        self.calls.append(
            {
                "function": function,
                "args": args,
                "kwargs": kwargs,
            }
        )
        return SimpleNamespace(job_id=kwargs.get("_job_id"))


class _FailingArqPool:
    async def enqueue_job(self, function: str, *args: object, **kwargs: object) -> object:
        del function
        del args
        del kwargs
        raise RuntimeError("redis unavailable")


class _RetryableProviderError(Exception):
    def __init__(self, status_code: int) -> None:
        super().__init__(f"provider error {status_code}")
        self.status_code = status_code


class _RetryableFailureExtractionIntegration:
    async def extract(
        self,
        notes: PreparedCaptureInput | str,
        *,
        mode: ExtractionMode = "initial",
    ) -> ExtractionResult:
        del notes, mode
        raise ExtractionError("Claude request failed: retryable") from _RetryableProviderError(429)
