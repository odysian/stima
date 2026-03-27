"""Helpers for validating supported image types from magic bytes."""

from __future__ import annotations

_IMAGE_SIGNATURES: tuple[tuple[bytes, str], ...] = (
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
)


def detect_image_content_type(data: bytes) -> str | None:
    """Return the supported MIME type for image bytes, if recognized."""
    for signature, content_type in _IMAGE_SIGNATURES:
        if data.startswith(signature):
            return content_type
    return None
