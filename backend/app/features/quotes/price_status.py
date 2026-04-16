"""Helpers for normalizing line-item price status semantics."""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Literal

LineItemPriceStatus = Literal["priced", "included", "unknown"]
_LINE_ITEM_PRICE_STATUS_VALUES = frozenset({"priced", "included", "unknown"})
_INCLUDED_NO_CHARGE_PATTERN = re.compile(
    r"\b(included|no[\s-]?charge|n/?c|complimentary|at no cost)\b",
    flags=re.IGNORECASE,
)


def has_included_no_charge_language(*parts: str | None) -> bool:
    """Return True when text includes explicit included/no-charge language."""
    for part in parts:
        if part is None:
            continue
        if _INCLUDED_NO_CHARGE_PATTERN.search(part):
            return True
    return False


def resolve_line_item_price_status(
    *,
    price: float | Decimal | None,
    price_status: str | None,
    description: str | None,
    details: str | None,
) -> LineItemPriceStatus:
    """Resolve one line-item status with compatibility handling for legacy rows."""
    normalized_status: LineItemPriceStatus | None = None
    if isinstance(price_status, str):
        normalized = price_status.strip().casefold()
        if normalized:
            if normalized not in _LINE_ITEM_PRICE_STATUS_VALUES:
                raise ValueError("price_status must be one of priced, included, or unknown")
            normalized_status = normalized  # type: ignore[assignment]

    has_price = price is not None

    if normalized_status == "priced" and not has_price:
        raise ValueError("price_status=priced requires a numeric price")
    if normalized_status in {"included", "unknown"} and has_price:
        raise ValueError("price_status included/unknown requires a null price")

    if normalized_status is not None:
        return normalized_status
    if has_price:
        return "priced"
    if has_included_no_charge_language(description, details):
        return "included"
    return "unknown"
