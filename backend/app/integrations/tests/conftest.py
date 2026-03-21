"""Audio fixture generation for integration tests that exercise real ffmpeg decode paths."""

from __future__ import annotations

import math
import struct
import subprocess  # nosec B404
import wave
from io import BytesIO
from pathlib import Path

import pytest

_SAMPLE_RATE = 16_000
_DURATION_SECONDS = 1.0
_FREQUENCY_HZ = 440.0
_AMPLITUDE = 0.4
_TWO_PI = 2 * math.pi


def _build_wav_bytes() -> bytes:
    frame_count = int(_SAMPLE_RATE * _DURATION_SECONDS)
    pcm_frames = bytearray()

    for index in range(frame_count):
        sample = int(
            32767 * _AMPLITUDE * math.sin((_TWO_PI * _FREQUENCY_HZ * index) / _SAMPLE_RATE)
        )
        pcm_frames.extend(struct.pack("<h", sample))

    buffer = BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(_SAMPLE_RATE)
        wav_file.writeframes(bytes(pcm_frames))

    return buffer.getvalue()


def _transcode_with_ffmpeg(
    *,
    wav_payload: bytes,
    output_extension: str,
    codec: str,
    temp_dir: Path,
) -> bytes:
    input_path = temp_dir / "source.wav"
    output_path = temp_dir / f"encoded.{output_extension}"
    input_path.write_bytes(wav_payload)

    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(input_path),
        "-vn",
        "-c:a",
        codec,
        str(output_path),
    ]
    try:
        subprocess.run(command, check=True, capture_output=True)  # nosec B603
    except FileNotFoundError as exc:
        raise RuntimeError("ffmpeg is required to generate audio integration fixtures") from exc

    return output_path.read_bytes()


@pytest.fixture(scope="session")
def wav_bytes() -> bytes:
    return _build_wav_bytes()


@pytest.fixture(scope="session")
def webm_bytes(wav_bytes: bytes, tmp_path_factory: pytest.TempPathFactory) -> bytes:
    fixture_dir = tmp_path_factory.mktemp("audio-fixture-webm")
    return _transcode_with_ffmpeg(
        wav_payload=wav_bytes,
        output_extension="webm",
        codec="libopus",
        temp_dir=fixture_dir,
    )


@pytest.fixture(scope="session")
def m4a_bytes(wav_bytes: bytes, tmp_path_factory: pytest.TempPathFactory) -> bytes:
    fixture_dir = tmp_path_factory.mktemp("audio-fixture-m4a")
    return _transcode_with_ffmpeg(
        wav_payload=wav_bytes,
        output_extension="m4a",
        codec="aac",
        temp_dir=fixture_dir,
    )
