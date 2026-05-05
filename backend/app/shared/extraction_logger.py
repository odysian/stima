"""Structured extraction trace logging helpers."""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any

from app.shared.observability import current_correlation_id, sanitize_log_fields

EXTRACTION_LOGGER_NAME = "stima.extraction"
_HANDLER_SENTINEL = "_stima_extraction_handler"
_EXTRACTION_LOGGER = logging.getLogger(EXTRACTION_LOGGER_NAME)


def configure_extraction_logging() -> None:
    """Attach stdout extraction trace logging once."""
    _EXTRACTION_LOGGER.setLevel(logging.INFO)
    _EXTRACTION_LOGGER.propagate = False
    if any(getattr(handler, _HANDLER_SENTINEL, False) for handler in _EXTRACTION_LOGGER.handlers):
        return

    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    setattr(handler, _HANDLER_SENTINEL, True)
    _EXTRACTION_LOGGER.addHandler(handler)


def log_extraction_trace(
    event: str,
    *,
    stage: str,
    outcome: str,
    level: int = logging.INFO,
    **fields: Any,
) -> None:
    """Emit one structured extraction trace event."""
    payload: dict[str, Any] = {
        "event": event,
        "timestamp": datetime.now(UTC).isoformat(),
        "level": logging.getLevelName(level),
        "logger": EXTRACTION_LOGGER_NAME,
        "correlation_id": current_correlation_id(),
        "stage": stage,
        "outcome": outcome,
    }
    payload.update(sanitize_log_fields(fields))

    _EXTRACTION_LOGGER.log(level, json.dumps(payload, default=str, sort_keys=True))
