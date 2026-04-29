"""Structured address formatting behavior tests."""

from __future__ import annotations

from app.shared.address_formatting import format_address, format_address_lines


def test_format_address_lines_returns_full_multiline_address() -> None:
    lines = format_address_lines(
        "123 Main St",
        "Suite 200",
        "Cleveland",
        "OH",
        "44113",
    )

    assert lines == ["123 Main St", "Suite 200", "Cleveland, OH 44113"]  # nosec B101


def test_format_address_lines_handles_partial_locality_fields() -> None:
    assert format_address_lines(None, None, "Cleveland", None, "44113") == [  # nosec B101
        "Cleveland 44113"
    ]
    assert format_address_lines(None, None, None, "OH", "44113") == ["OH 44113"]  # nosec B101
    assert format_address_lines(None, None, "Cleveland", None, None) == ["Cleveland"]  # nosec B101


def test_format_address_omits_blank_values_and_returns_none_for_empty_address() -> None:
    assert format_address("  ", None, None, None, None) is None  # nosec B101
    assert format_address("123 Main St", "", "Cleveland", "OH", "") == (
        "123 Main St\nCleveland, OH"
    )  # nosec B101
