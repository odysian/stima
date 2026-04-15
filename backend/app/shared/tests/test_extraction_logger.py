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

    def _capture(level: int, message: str) -> None:
        captured.append((level, message))

    monkeypatch.setattr(extraction_logger._EXTRACTION_LOGGER, "log", _capture)  # noqa: SLF001
    extraction_logger.configure_extraction_logging(include_raw_content=False)

    extraction_logger.log_extraction_trace(
        "extraction.trace",
        stage="primary",
        outcome="started",
        raw_transcript="operator notes",
        raw_tool_payload={"line_items": [{"description": "trim"}]},
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


def test_log_extraction_trace_includes_raw_fields_when_opted_in(monkeypatch) -> None:
    captured: list[tuple[int, str]] = []
    monkeypatch.setattr(extraction_logger, "current_correlation_id", lambda: "corr-456")

    def _capture(level: int, message: str) -> None:
        captured.append((level, message))

    monkeypatch.setattr(extraction_logger._EXTRACTION_LOGGER, "log", _capture)  # noqa: SLF001
    extraction_logger.configure_extraction_logging(include_raw_content=True)

    extraction_logger.log_extraction_trace(
        "extraction.trace",
        stage="repair",
        outcome="succeeded",
        raw_transcript="full transcript",
        raw_tool_payload={"line_items": [{"description": "edging"}]},
        extraction_model_id="test-model",
    )

    assert len(captured) == 1
    payload = json.loads(captured[0][1])
    assert payload["stage"] == "repair"
    assert payload["outcome"] == "succeeded"
    assert payload["correlation_id"] == "corr-456"
    assert payload["raw_transcript"] == "full transcript"
    assert payload["raw_tool_payload"] == {"line_items": [{"description": "edging"}]}
