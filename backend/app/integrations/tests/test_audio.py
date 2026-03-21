"""Audio integration unit tests for clip normalization and validation."""

from __future__ import annotations

import pytest
from app.integrations.audio import AudioClip, AudioError, AudioIntegration
from pydub import AudioSegment  # type: ignore[import-untyped]


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

    def _decode_clip(_: AudioClip) -> AudioSegment:
        return AudioSegment.silent(duration=601_000)

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

    def _decode_clip(_: AudioClip) -> AudioSegment:
        return AudioSegment.silent(duration=1_000)

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
