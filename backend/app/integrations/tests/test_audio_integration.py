"""Integration tests for real decode + normalization paths in AudioIntegration."""

from __future__ import annotations

import wave
from io import BytesIO

import pytest
from app.integrations.audio import AudioClip, AudioError, AudioIntegration

_DURATION_TOLERANCE_SECONDS = 0.03


def _read_wav_details(wav_payload: bytes) -> tuple[int, int, int, float]:
    with wave.open(BytesIO(wav_payload), "rb") as wav_file:
        channels = wav_file.getnchannels()
        framerate = wav_file.getframerate()
        sample_width = wav_file.getsampwidth()
        duration_seconds = wav_file.getnframes() / framerate

    return channels, framerate, sample_width, duration_seconds


def _assert_normalized_wav_contract(wav_payload: bytes) -> None:
    channels, framerate, sample_width, _ = _read_wav_details(wav_payload)
    assert channels == 1  # nosec B101
    assert framerate == 16000  # nosec B101
    assert sample_width == 2  # nosec B101


def test_normalize_and_stitch_single_wav_returns_expected_contract(wav_bytes: bytes) -> None:
    integration = AudioIntegration()

    normalized = integration.normalize_and_stitch(
        [
            AudioClip(
                filename="clip.wav",
                content_type="audio/wav",
                content=wav_bytes,
            )
        ]
    )

    _assert_normalized_wav_contract(normalized)


def test_normalize_and_stitch_single_webm_returns_expected_contract(webm_bytes: bytes) -> None:
    integration = AudioIntegration()

    normalized = integration.normalize_and_stitch(
        [
            AudioClip(
                filename="clip.webm",
                content_type="audio/webm",
                content=webm_bytes,
            )
        ]
    )

    _assert_normalized_wav_contract(normalized)


def test_normalize_and_stitch_single_m4a_returns_expected_contract(m4a_bytes: bytes) -> None:
    integration = AudioIntegration()

    normalized = integration.normalize_and_stitch(
        [
            AudioClip(
                filename="clip.m4a",
                content_type="audio/mp4",
                content=m4a_bytes,
            )
        ]
    )

    _assert_normalized_wav_contract(normalized)


def test_normalize_and_stitch_two_wav_clips_includes_gap_duration(wav_bytes: bytes) -> None:
    integration = AudioIntegration()
    _, _, _, clip_duration_seconds = _read_wav_details(wav_bytes)

    normalized = integration.normalize_and_stitch(
        [
            AudioClip(
                filename="clip-1.wav",
                content_type="audio/wav",
                content=wav_bytes,
            ),
            AudioClip(
                filename="clip-2.wav",
                content_type="audio/wav",
                content=wav_bytes,
            ),
        ]
    )

    _assert_normalized_wav_contract(normalized)
    _, _, _, normalized_duration_seconds = _read_wav_details(normalized)
    expected_seconds = (clip_duration_seconds * 2) + 0.3
    assert normalized_duration_seconds >= expected_seconds - _DURATION_TOLERANCE_SECONDS  # nosec B101


def test_normalize_and_stitch_raises_audio_error_for_corrupted_bytes() -> None:
    integration = AudioIntegration()

    with pytest.raises(AudioError, match="Audio clip format is not supported or file is corrupted"):
        integration.normalize_and_stitch(
            [
                AudioClip(
                    filename="corrupted.webm",
                    content_type="audio/webm",
                    content=b"not-a-valid-audio-payload",
                )
            ]
        )
