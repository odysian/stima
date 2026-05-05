"""Structured extraction trace logger tests."""

from __future__ import annotations

import json
import logging
import sys

from app.shared import extraction_logger


def test_configure_extraction_logging_uses_stdout_and_does_not_duplicate_handlers() -> None:
    logger = logging.getLogger(extraction_logger.EXTRACTION_LOGGER_NAME)
    original_handlers = list(logger.handlers)
    original_level = logger.level
    original_propagate = logger.propagate

    try:
        for handler in list(logger.handlers):
            logger.removeHandler(handler)

        extraction_logger.configure_extraction_logging()
        extraction_logger.configure_extraction_logging()

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


def test_log_extraction_trace_excludes_raw_fields_by_default(monkeypatch) -> None:
    captured: list[tuple[int, str]] = []
    monkeypatch.setattr(extraction_logger, "current_correlation_id", lambda: "corr-123")
    transcript_sentinel = "TRANSCRIPT_SENTINEL_DO_NOT_LOG"
    payload_sentinel = "TOOL_PAYLOAD_SENTINEL_DO_NOT_LOG"

    def _capture(level: int, message: str) -> None:
        captured.append((level, message))

    monkeypatch.setattr(extraction_logger._EXTRACTION_LOGGER, "log", _capture)  # noqa: SLF001
    extraction_logger.configure_extraction_logging()

    extraction_logger.log_extraction_trace(
        "extraction.trace",
        stage="primary",
        outcome="started",
        raw_transcript=transcript_sentinel,
        raw_tool_payload={"line_items": [{"description": payload_sentinel}]},
        error_message="PROVIDER_SECRET_SENTINEL_DO_NOT_LOG",
        extraction_model_id="test-model",
    )

    assert len(captured) == 1
    payload = json.loads(captured[0][1])
    assert payload["event"] == "extraction.trace"
    assert payload["stage"] == "primary"
    assert payload["outcome"] == "started"
    assert payload["correlation_id"] == "corr-123"
    assert payload["logger"] == extraction_logger.EXTRACTION_LOGGER_NAME
    assert payload["extraction_model_id"] == "test-model"
    assert "raw_transcript" not in payload
    assert "raw_tool_payload" not in payload
    assert "error_message" not in payload
    assert transcript_sentinel not in captured[0][1]
    assert payload_sentinel not in captured[0][1]
    assert "PROVIDER_SECRET_SENTINEL_DO_NOT_LOG" not in captured[0][1]


def test_log_extraction_trace_drops_sensitive_fields_by_name(monkeypatch) -> None:
    captured: list[tuple[int, str]] = []
    monkeypatch.setattr(extraction_logger, "current_correlation_id", lambda: "corr-456")
    transcript_sentinel = "TRANSCRIPT_SENTINEL_DO_NOT_LOG"
    payload_sentinel = "TOOL_PAYLOAD_SENTINEL_DO_NOT_LOG"

    def _capture(level: int, message: str) -> None:
        captured.append((level, message))

    monkeypatch.setattr(extraction_logger._EXTRACTION_LOGGER, "log", _capture)  # noqa: SLF001
    extraction_logger.configure_extraction_logging()

    extraction_logger.log_extraction_trace(
        "extraction.trace",
        stage="repair",
        outcome="succeeded",
        raw_transcript=transcript_sentinel,
        raw_tool_payload={"line_items": [{"description": payload_sentinel}]},
        prompt="PROMPT_SENTINEL_DO_NOT_LOG",
        extraction_model_id="test-model",
    )

    assert len(captured) == 1
    payload = json.loads(captured[0][1])
    assert payload["stage"] == "repair"
    assert payload["outcome"] == "succeeded"
    assert payload["correlation_id"] == "corr-456"
    assert payload["extraction_model_id"] == "test-model"
    assert "raw_transcript" not in payload
    assert "raw_tool_payload" not in payload
    assert "prompt" not in payload
    assert transcript_sentinel not in captured[0][1]
    assert payload_sentinel not in captured[0][1]
    assert "PROMPT_SENTINEL_DO_NOT_LOG" not in captured[0][1]
