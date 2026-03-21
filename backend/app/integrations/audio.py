"""Audio normalization and stitching integration for voice quote capture."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from io import BytesIO
from typing import Any

MAX_AUDIO_DURATION_SECONDS = 600
CLIP_GAP_MS = 300


class AudioError(Exception):
    """Raised when uploaded audio clips cannot be normalized safely."""


@dataclass(slots=True)
class AudioClip:
    """Raw uploaded clip payload captured at the API boundary."""

    filename: str | None
    content_type: str | None
    content: bytes


class AudioIntegration:
    """Normalize one or more uploaded clips into a single WAV payload."""

    def normalize_and_stitch(self, clips: Sequence[AudioClip]) -> bytes:
        """Decode clips, validate shape, stitch with silence, and export WAV bytes."""
        if not clips:
            raise AudioError("At least one audio clip is required")

        for clip in clips:
            if not clip.content:
                raise AudioError("Audio clip is empty")

        audio_segment_cls = _load_audio_segment_class()
        stitched: Any | None = None
        gap = audio_segment_cls.silent(duration=CLIP_GAP_MS)

        for clip in clips:
            audio_segment = self._decode_clip(clip, audio_segment_cls)
            if len(audio_segment) <= 0:
                raise AudioError("Audio clip is empty")

            if stitched is None:
                stitched = audio_segment
            else:
                stitched = stitched + gap + audio_segment

        if stitched is None:
            raise AudioError("At least one audio clip is required")

        normalized = stitched.set_channels(1).set_frame_rate(16000).set_sample_width(2)

        if normalized.duration_seconds > MAX_AUDIO_DURATION_SECONDS:
            raise AudioError(
                f"Combined audio exceeds maximum duration of {MAX_AUDIO_DURATION_SECONDS} seconds"
            )

        output_buffer = BytesIO()
        normalized.export(output_buffer, format="wav")
        wav_bytes = output_buffer.getvalue()

        if not wav_bytes:
            raise AudioError("Audio normalization failed")

        return wav_bytes

    def _decode_clip(self, clip: AudioClip, audio_segment_cls: Any) -> Any:
        format_hint = _infer_format(filename=clip.filename, content_type=clip.content_type)
        buffer = BytesIO(clip.content)

        try:
            if format_hint:
                return audio_segment_cls.from_file(buffer, format=format_hint)
            return audio_segment_cls.from_file(buffer)
        except Exception as exc:  # pragma: no cover - ffmpeg decode failures vary by runtime
            raise AudioError("Audio clip format is not supported or file is corrupted") from exc


def _load_audio_segment_class() -> Any:
    """Load pydub lazily so app startup does not fail when audio deps are unavailable."""
    try:
        from pydub import AudioSegment  # type: ignore[import-untyped]
    except ModuleNotFoundError as exc:
        raise AudioError(
            "Audio processing dependency is unavailable for this Python runtime"
        ) from exc

    return AudioSegment


def _infer_format(*, filename: str | None, content_type: str | None) -> str | None:
    """Infer best-effort format hint from multipart metadata when available."""
    if filename and "." in filename:
        extension = filename.rsplit(".", 1)[-1].lower()
        if extension == "m4a":
            return "mp4"
        return extension

    if content_type and "/" in content_type:
        subtype = content_type.split("/", 1)[1].lower()
        if subtype in {"x-m4a", "m4a", "aac"}:
            return "mp4"
        if subtype in {"webm", "wav", "mpeg", "mp3", "mp4", "ogg"}:
            return subtype

    return None
