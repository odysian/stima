"""Structured observability logging tests."""

from __future__ import annotations

import logging

from app.shared import observability


def test_log_security_event_drops_sensitive_fields_by_name(monkeypatch) -> None:
    captured: list[dict[str, object]] = []

    def _capture(payload: dict[str, object], *, level: int) -> None:
        captured.append({**payload, "_level": level})

    monkeypatch.setattr(observability, "_emit_security_payload", _capture)
    monkeypatch.setattr(observability, "current_correlation_id", lambda: "corr-sec-123")

    observability.log_security_event(
        "jobs.terminal_failure",
        outcome="terminal",
        level=logging.ERROR,
        reason="unexpected_error",
        job_id="job-123",
        error_class="RuntimeError",
        raw_transcript="TRANSCRIPT_SENTINEL_DO_NOT_LOG",
        raw_tool_payload={"details": "TOOL_PAYLOAD_SENTINEL_DO_NOT_LOG"},
        prompt="PROMPT_SENTINEL_DO_NOT_LOG",
        response="RESPONSE_SENTINEL_DO_NOT_LOG",
        provider_api_key="SECRET_SENTINEL_DO_NOT_LOG",
        token_usage={"input_tokens": 12, "output_tokens": 4},
        transcript_chars=42,
    )

    assert len(captured) == 1
    payload = captured[0]
    assert payload["event"] == "jobs.terminal_failure"
    assert payload["correlation_id"] == "corr-sec-123"
    assert payload["job_id"] == "job-123"
    assert payload["error_class"] == "RuntimeError"
    assert payload["token_usage"] == {"input_tokens": 12, "output_tokens": 4}
    assert payload["transcript_chars"] == 42
    assert "raw_transcript" not in payload
    assert "raw_tool_payload" not in payload
    assert "prompt" not in payload
    assert "response" not in payload
    assert "provider_api_key" not in payload
