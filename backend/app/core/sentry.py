"""Sentry bootstrap for FastAPI runtime errors."""

from __future__ import annotations

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

_INITIALIZED_DSN: str | None = None


def init_sentry(*, dsn: str | None, environment: str) -> None:
    """Initialize Sentry once per DSN, or no-op when DSN is unset."""
    global _INITIALIZED_DSN

    if dsn is None or dsn == _INITIALIZED_DSN:
        return

    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        integrations=[FastApiIntegration()],
        send_default_pii=False,
        traces_sample_rate=0.0,
    )
    _INITIALIZED_DSN = dsn
