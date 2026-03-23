"""Structured business event logging helpers."""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime
from uuid import UUID

EVENT_LOGGER_NAME = "stima.events"
_HANDLER_SENTINEL = "_stima_event_handler"
_EVENT_LOGGER = logging.getLogger(EVENT_LOGGER_NAME)


def configure_event_logging() -> None:
    """Attach a stdout handler for structured event messages exactly once."""
    _EVENT_LOGGER.setLevel(logging.INFO)
    _EVENT_LOGGER.propagate = False
    if any(getattr(handler, _HANDLER_SENTINEL, False) for handler in _EVENT_LOGGER.handlers):
        return

    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    setattr(handler, _HANDLER_SENTINEL, True)
    _EVENT_LOGGER.addHandler(handler)


def log_event(
    event: str,
    *,
    user_id: UUID | None = None,
    quote_id: UUID | None = None,
    customer_id: UUID | None = None,
    detail: str | None = None,
) -> None:
    """Emit a structured JSON log record for one business event."""
    payload = {
        "event": event,
        "timestamp": datetime.now(UTC).isoformat(),
        "user_id": str(user_id) if user_id else None,
        "quote_id": str(quote_id) if quote_id else None,
        "customer_id": str(customer_id) if customer_id else None,
        "detail": detail,
    }
    _EVENT_LOGGER.info(
        json.dumps({key: value for key, value in payload.items() if value is not None})
    )
