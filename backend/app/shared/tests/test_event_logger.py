"""Structured event logger tests."""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime
from uuid import uuid4

from app.shared import event_logger


def test_configure_event_logging_uses_stdout_and_does_not_duplicate_handlers() -> None:
    logger = logging.getLogger(event_logger.EVENT_LOGGER_NAME)
    original_handlers = list(logger.handlers)
    original_level = logger.level
    original_propagate = logger.propagate

    try:
        for handler in list(logger.handlers):
            logger.removeHandler(handler)

        event_logger.configure_event_logging()
        event_logger.configure_event_logging()

        assert logger.level == logging.INFO
        assert logger.propagate is False
        assert len(logger.handlers) == 1
        handler = logger.handlers[0]
        assert isinstance(handler, logging.StreamHandler)
        assert handler.stream is sys.stdout
        assert handler.formatter is not None
        assert handler.formatter._fmt == "%(message)s"  # noqa: SLF001
    finally:
        for handler in list(logger.handlers):
            logger.removeHandler(handler)
        for handler in original_handlers:
            logger.addHandler(handler)
        logger.setLevel(original_level)
        logger.propagate = original_propagate


def test_log_event_emits_json_payload_without_none_fields(monkeypatch) -> None:
    calls: list[str] = []
    user_id = uuid4()
    quote_id = uuid4()

    monkeypatch.setattr(event_logger._EVENT_LOGGER, "info", calls.append)  # noqa: SLF001

    event_logger.log_event(
        "quote.created",
        user_id=user_id,
        quote_id=quote_id,
    )

    assert len(calls) == 1
    payload = json.loads(calls[0])
    assert payload["event"] == "quote.created"
    assert payload["user_id"] == str(user_id)
    assert payload["quote_id"] == str(quote_id)
    assert "customer_id" not in payload
    assert "detail" not in payload
    datetime.fromisoformat(payload["timestamp"])
