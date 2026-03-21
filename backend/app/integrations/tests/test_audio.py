"""Audio integration unit tests for clip normalization and validation."""

from __future__ import annotations

from collections.abc import Sized
from io import BytesIO

import pytest
from app.integrations.audio import AudioClip, AudioError, AudioIntegration, _infer_format


class _FakeSegment:
    def __init__(self, *, duration_ms: int) -> None:
        self._duration_ms = duration_ms

    def __len__(self) -> int:
        return self._duration_ms

    def __add__(self, other: Sized) -> _FakeSegment:
        return _FakeSegment(duration_ms=self._duration_ms + len(other))

    @property
    def duration_seconds(self) -> float:
        return self._duration_ms / 1000

    def set_channels(self, channels: int) -> _FakeSegment:
        del channels
        return self

    def set_frame_rate(self, frame_rate: int) -> _FakeSegment:
        del frame_rate
        return self

    def set_sample_width(self, sample_width: int) -> _FakeSegment:
        del sample_width
        return self

    def export(self, output_buffer: BytesIO, *, format: str) -> None:
        del format
        output_buffer.write(b"RIFF" + (b"\x00" * 124))


class _FakeAudioSegmentClass:
    @staticmethod
    def silent(*, duration: int) -> _FakeSegment:
        return _FakeSegment(duration_ms=duration)


def test_normalize_and_stitch_rejects_empty_clip_list() -> None:
    integration = AudioIntegration()

    with pytest.raises(AudioError, match="At least one audio clip is required"):
        integration.normalize_and_stitch([])


def test_normalize_and_stitch_rejects_empty_clip_content() -> None:
    integration = AudioIntegration()

    with pytest.raises(AudioError, match="Audio clip is empty"):
        integration.normalize_and_stitch(
            [
                AudioClip(
                    filename="clip-1.webm",
                    content_type="audio/webm",
                    content=b"",
                )
            ]
        )


def test_normalize_and_stitch_rejects_overlong_audio(monkeypatch: pytest.MonkeyPatch) -> None:
    integration = AudioIntegration()

    monkeypatch.setattr(
        "app.integrations.audio._load_audio_segment_class",
        lambda: _FakeAudioSegmentClass,
    )

    def _decode_clip(_: AudioClip, __: object) -> _FakeSegment:
        return _FakeSegment(duration_ms=601_000)

    monkeypatch.setattr(integration, "_decode_clip", _decode_clip)

    with pytest.raises(AudioError, match="Combined audio exceeds maximum duration"):
        integration.normalize_and_stitch(
            [
                AudioClip(
                    filename="clip-1.webm",
                    content_type="audio/webm",
                    content=b"x",
                )
            ]
        )


def test_normalize_and_stitch_returns_wav_bytes(monkeypatch: pytest.MonkeyPatch) -> None:
    integration = AudioIntegration()

    monkeypatch.setattr(
        "app.integrations.audio._load_audio_segment_class",
        lambda: _FakeAudioSegmentClass,
    )

    def _decode_clip(_: AudioClip, __: object) -> _FakeSegment:
        return _FakeSegment(duration_ms=1_000)

    monkeypatch.setattr(integration, "_decode_clip", _decode_clip)

    wav_bytes = integration.normalize_and_stitch(
        [
            AudioClip(
                filename="clip-1.webm",
                content_type="audio/webm",
                content=b"a",
            ),
            AudioClip(
                filename="clip-2.webm",
                content_type="audio/webm",
                content=b"b",
            ),
        ]
    )

    assert wav_bytes.startswith(b"RIFF")  # nosec B101
    assert len(wav_bytes) > 100  # nosec B101


def test_infer_format_prefers_content_type_over_filename_extension() -> None:
    assert _infer_format(filename="clip.webm", content_type="audio/mp4") == "mp4"  # nosec B101


def test_infer_format_falls_back_to_filename_extension() -> None:
    assert _infer_format(filename="clip.ogg", content_type=None) == "ogg"  # nosec B101
