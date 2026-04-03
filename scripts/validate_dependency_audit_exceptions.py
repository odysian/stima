#!/usr/bin/env python3
"""Validate the structured dependency audit exception registry used by CI."""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path
from typing import Any


EXCEPTIONS_PATH = Path("security/dependency-audit-exceptions.json")
REQUIRED_FIELDS = (
    "id",
    "ecosystem",
    "package",
    "advisory",
    "reason",
    "owner",
    "expires_on",
)
VALID_ECOSYSTEMS = {"pip", "npm"}


def _error(message: str) -> None:
    print(f"[dependency-audit-exceptions] {message}", file=sys.stderr)


def validate_payload(payload: Any, *, today: date | None = None) -> str | None:
    validation_date = today or date.today()
    if not isinstance(payload, dict):
        return "top-level payload must be an object"

    exceptions = payload.get("exceptions")
    if not isinstance(exceptions, list):
        return "top-level 'exceptions' field must be a list"

    for index, entry in enumerate(exceptions, start=1):
        if not isinstance(entry, dict):
            return f"entry {index} must be an object"

        entry_fields = set(entry.keys())
        required_fields = set(REQUIRED_FIELDS)
        if entry_fields != required_fields:
            missing_fields = sorted(required_fields - entry_fields)
            unknown_fields = sorted(entry_fields - required_fields)
            details: list[str] = []
            if missing_fields:
                details.append(f"missing: {', '.join(missing_fields)}")
            if unknown_fields:
                details.append(f"unknown: {', '.join(unknown_fields)}")
            return (
                f"entry {index} must contain exactly these fields: "
                f"{', '.join(REQUIRED_FIELDS)}"
                + (f" ({'; '.join(details)})" if details else "")
            )

        for field in REQUIRED_FIELDS:
            value = entry[field]
            if not isinstance(value, str) or not value.strip():
                return f"entry {index} field '{field}' must be a non-empty string"

        if entry["ecosystem"] not in VALID_ECOSYSTEMS:
            return (
                f"entry {index} ecosystem must be one of: {', '.join(sorted(VALID_ECOSYSTEMS))}"
            )

        try:
            expires_on = date.fromisoformat(entry["expires_on"])
        except ValueError:
            return f"entry {index} expires_on must use YYYY-MM-DD format"

        if expires_on < validation_date:
            return f"entry {index} is expired on {entry['expires_on']}"

    return None


def main() -> int:
    try:
        payload = json.loads(EXCEPTIONS_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        _error(f"missing file: {EXCEPTIONS_PATH}")
        return 1
    except json.JSONDecodeError as exc:
        _error(f"invalid JSON: {exc}")
        return 1

    error_message = validate_payload(payload)
    if error_message is not None:
        _error(error_message)
        return 1

    exceptions = payload["exceptions"]
    print(
        f"Validated {len(exceptions)} dependency audit exception(s) in {EXCEPTIONS_PATH}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
