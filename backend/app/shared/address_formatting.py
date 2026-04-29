"""Address formatting helpers for structured business and customer contact fields."""

from __future__ import annotations


def _normalize_part(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def format_address_lines(
    line1: str | None,
    line2: str | None,
    city: str | None,
    state: str | None,
    postal: str | None,
) -> list[str]:
    """Return ordered non-empty address lines from structured address parts."""
    normalized_line1 = _normalize_part(line1)
    normalized_line2 = _normalize_part(line2)
    normalized_city = _normalize_part(city)
    normalized_state = _normalize_part(state)
    normalized_postal = _normalize_part(postal)

    locality_parts = [part for part in (normalized_city, normalized_state) if part is not None]
    locality_line = ", ".join(locality_parts)
    if normalized_postal is not None:
        locality_line = (
            f"{locality_line} {normalized_postal}" if locality_line else normalized_postal
        )

    lines = [
        part
        for part in (
            normalized_line1,
            normalized_line2,
            locality_line or None,
        )
        if part is not None
    ]
    return lines


def format_address(
    line1: str | None,
    line2: str | None,
    city: str | None,
    state: str | None,
    postal: str | None,
) -> str | None:
    """Return one printable address block, or ``None`` when no parts are present."""
    lines = format_address_lines(line1, line2, city, state, postal)
    if not lines:
        return None
    return "\n".join(lines)
