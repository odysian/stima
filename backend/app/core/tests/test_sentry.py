"""Sentry bootstrap tests."""

from __future__ import annotations

from typing import Any

from app.core import sentry as sentry_config


def test_init_sentry_is_noop_without_dsn(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(sentry_config, "_INITIALIZED_DSN", None)
    monkeypatch.setattr(sentry_config.sentry_sdk, "init", lambda **kwargs: calls.append(kwargs))

    sentry_config.init_sentry(dsn=None, environment="test")

    assert calls == []


def test_init_sentry_uses_safe_defaults(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(sentry_config, "_INITIALIZED_DSN", None)
    monkeypatch.setattr(sentry_config.sentry_sdk, "init", lambda **kwargs: calls.append(kwargs))

    sentry_config.init_sentry(
        dsn="https://public@example.ingest.sentry.io/1",
        environment="production",
    )

    assert len(calls) == 1
    assert calls[0]["dsn"] == "https://public@example.ingest.sentry.io/1"
    assert calls[0]["environment"] == "production"
    assert calls[0]["send_default_pii"] is False
    assert calls[0]["traces_sample_rate"] == 0.0
    assert calls[0]["integrations"][0].__class__.__name__ == "FastApiIntegration"
