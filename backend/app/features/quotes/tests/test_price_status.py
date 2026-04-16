"""Unit tests for line-item price-status normalization helpers."""

from __future__ import annotations

import pytest

from app.features.quotes.price_status import (
    resolve_line_item_price_status,
    resolve_line_item_price_status_with_fallback,
)


def test_resolve_line_item_price_status_rejects_included_with_numeric_price() -> None:
    with pytest.raises(ValueError, match="price_status included/unknown requires a null price"):
        resolve_line_item_price_status(
            price=90.0,
            price_status="included",
            description="Final walkthrough",
            details="No-charge item",
        )


def test_resolve_line_item_price_status_with_fallback_coerces_invalid_combo() -> None:
    assert (
        resolve_line_item_price_status_with_fallback(
            price=90.0,
            price_status="included",
            description="Final walkthrough",
            details="No-charge item",
        )
        == "priced"
    )
