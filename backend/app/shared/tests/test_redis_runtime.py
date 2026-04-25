"""Redis runtime degraded-mode resolution tests."""

from __future__ import annotations

import asyncio
from collections.abc import Iterator
from unittest.mock import AsyncMock

import pytest
from app.core.config import get_settings
from app.shared.redis_runtime import (
    RedisRuntimeResolutionError,
    probe_redis,
    resolve_redis_runtime_state,
)


@pytest.fixture(autouse=True)
def _required_settings(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-that-is-at-least-32-bytes")
    monkeypatch.setenv("GCS_BUCKET_NAME", "stima-test-logos")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_probe_redis_success(monkeypatch: pytest.MonkeyPatch) -> None:
    class _FakeRedis:
        async def ping(self) -> bool:
            return True

        async def aclose(self) -> None:
            return None

    monkeypatch.setattr("app.shared.redis_runtime.Redis.from_url", lambda *_a, **_k: _FakeRedis())

    ok, reason = await probe_redis("redis://localhost:6379/0", timeout_seconds=0.1)

    assert ok is True
    assert reason is None


@pytest.mark.asyncio
async def test_probe_redis_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    class _FakeRedis:
        async def ping(self) -> bool:
            await asyncio.sleep(0.2)
            return True

        async def aclose(self) -> None:
            return None

    monkeypatch.setattr("app.shared.redis_runtime.Redis.from_url", lambda *_a, **_k: _FakeRedis())

    ok, reason = await probe_redis("redis://localhost:6379/0", timeout_seconds=0.01)

    assert ok is False
    assert reason == "redis_startup_timeout"


@pytest.mark.asyncio
async def test_resolve_runtime_state_uses_degraded_memory_when_missing_redis_and_allowed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    monkeypatch.setenv("FRONTEND_URL", "https://app.stima.dev")
    monkeypatch.setenv("ALLOWED_HOSTS", "api.stima.dev")
    monkeypatch.setenv("ALLOW_REDIS_DEGRADED_MODE", "true")
    monkeypatch.setenv("REDIS_URL", "")

    runtime_state = await resolve_redis_runtime_state(get_settings())

    assert runtime_state.mode == "degraded_memory"
    assert runtime_state.degraded_reason == "redis_missing"


@pytest.mark.asyncio
async def test_resolve_runtime_state_rejects_unhealthy_redis_when_degraded_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    monkeypatch.setenv("FRONTEND_URL", "https://app.stima.dev")
    monkeypatch.setenv("ALLOWED_HOSTS", "api.stima.dev")
    monkeypatch.setenv("ALLOW_REDIS_DEGRADED_MODE", "false")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setattr(
        "app.shared.redis_runtime.probe_redis",
        AsyncMock(return_value=(False, "redis_probe_failed")),
    )

    with pytest.raises(RedisRuntimeResolutionError):
        await resolve_redis_runtime_state(get_settings())


@pytest.mark.asyncio
async def test_resolve_runtime_state_allows_missing_redis_in_development_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("TEST_REDIS_URL", raising=False)
    monkeypatch.setenv("REDIS_URL", "")
    monkeypatch.setenv("ENVIRONMENT", "development")
    get_settings.cache_clear()

    settings = get_settings()

    runtime_state = await resolve_redis_runtime_state(settings)

    assert runtime_state.mode == "degraded_memory"
    assert runtime_state.degraded_reason == "redis_missing"
