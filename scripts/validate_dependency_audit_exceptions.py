#!/usr/bin/env python3
"""Validate the structured dependency audit exception registry used by CI."""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path


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


def main() -> int:
    try:
        payload = json.loads(EXCEPTIONS_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        _error(f"missing file: {EXCEPTIONS_PATH}")
        return 1
    except json.JSONDecodeError as exc:
        _error(f"invalid JSON: {exc}")
        return 1

    if not isinstance(payload, dict):
        _error("top-level payload must be an object")
        return 1

    exceptions = payload.get("exceptions")
    if not isinstance(exceptions, list):
        _error("top-level 'exceptions' field must be a list")
        return 1

    for index, entry in enumerate(exceptions, start=1):
        if not isinstance(entry, dict):
            _error(f"entry {index} must be an object")
            return 1

        entry_fields = tuple(entry.keys())
        if entry_fields != REQUIRED_FIELDS:
            _error(
                f"entry {index} must contain fields in order: {', '.join(REQUIRED_FIELDS)}"
            )
            return 1

        for field in REQUIRED_FIELDS:
            value = entry[field]
            if not isinstance(value, str) or not value.strip():
                _error(f"entry {index} field '{field}' must be a non-empty string")
                return 1

        if entry["ecosystem"] not in VALID_ECOSYSTEMS:
            _error(
                f"entry {index} ecosystem must be one of: {', '.join(sorted(VALID_ECOSYSTEMS))}"
            )
            return 1

        try:
            expires_on = date.fromisoformat(entry["expires_on"])
        except ValueError:
            _error(f"entry {index} expires_on must use YYYY-MM-DD format")
            return 1

        if expires_on < date.today():
            _error(f"entry {index} is expired on {entry['expires_on']}")
            return 1

    print(
        f"Validated {len(exceptions)} dependency audit exception(s) in {EXCEPTIONS_PATH}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
