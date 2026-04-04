"""Helpers for validating supported image types from magic bytes."""

from __future__ import annotations

_IMAGE_SIGNATURES: tuple[tuple[bytes, str], ...] = (
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
)
_PNG_IEND_TRAILER = b"\x00\x00\x00\x00IEND\xaeB`\x82"
_JPEG_EOI_MARKER = b"\xff\xd9"


def detect_image_content_type(data: bytes) -> str | None:
    """Return the supported MIME type for image bytes, if recognized."""
    for signature, content_type in _IMAGE_SIGNATURES:
        if data.startswith(signature) and _has_valid_image_trailer(data, content_type):
            return content_type
    return None


def _has_valid_image_trailer(data: bytes, content_type: str) -> bool:
    if content_type == "image/png":
        return data.endswith(_PNG_IEND_TRAILER)
    if content_type == "image/jpeg":
        return len(data) > len(_JPEG_EOI_MARKER) and data.endswith(_JPEG_EOI_MARKER)
    return False
