"""Rate-limit IP key extraction tests."""

from __future__ import annotations

import logging
import os
from collections.abc import Iterator
from uuid import uuid4

import pytest
from app.core.config import Settings, get_settings
from app.core.security import create_access_token
from app.shared.rate_limit import (
    ExtractionControlManager,
    ExtractionStateStore,
    RedisExtractionStateStore,
    build_limiter,
    configure_active_limiter_key_prefix,
    get_ip_key,
    get_user_key,
    resolve_limiter_backend,
    resolve_limiter_backend_for_runtime_mode,
)
from limits.storage.memory import MemoryStorage
from limits.storage.redis import RedisStorage
from pydantic import ValidationError
from starlette.requests import Request

_SKIP_REDIS_LIMITER_CONSTRUCTION = os.getenv("STIMA_SKIP_EAGER_REDIS_LIMITER_TESTS") == "1"


@pytest.fixture(autouse=True)
def _configure_settings(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv(
        "SECRET_KEY",
        "test-secret-key-that-is-at-least-32-bytes",
    )
    monkeypatch.delenv("TRUSTED_PROXY_IPS", raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_get_ip_key_ignores_forwarded_for_when_peer_is_untrusted() -> None:
    request = _build_request(
        peer_ip="198.51.100.20",
        headers={"X-Forwarded-For": "9.9.9.9, 198.51.100.10"},
    )

    ip_key = get_ip_key(request)

    assert ip_key == "198.51.100.20"


def test_get_ip_key_uses_rightmost_untrusted_hop_for_trusted_proxy_chain(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "10.0.0.0/8")
    get_settings.cache_clear()
    request = _build_request(
        peer_ip="10.10.0.5",
        headers={"X-Forwarded-For": "9.9.9.9, 198.51.100.7"},
    )

    ip_key = get_ip_key(request)

    assert ip_key == "198.51.100.7"


def test_get_ip_key_falls_back_to_peer_ip_when_forwarded_for_is_invalid(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "10.0.0.0/8")
    get_settings.cache_clear()
    request = _build_request(
        peer_ip="10.10.0.5",
        headers={"X-Forwarded-For": "malformed-ip"},
    )

    ip_key = get_ip_key(request)

    assert ip_key == "10.10.0.5"


def test_get_ip_key_uses_rightmost_valid_untrusted_hop_when_xff_has_injected_invalid_prefix(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Client injects garbage at the start; proxy appends the real client IP."""
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "10.0.0.0/8")
    get_settings.cache_clear()
    request = _build_request(
        peer_ip="10.10.0.5",
        headers={"X-Forwarded-For": "not-an-ip, 1.2.3.4"},
    )

    ip_key = get_ip_key(request)

    assert ip_key == "1.2.3.4"


def test_get_ip_key_uses_x_real_ip_when_trusted_peer_has_no_usable_xff(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "10.0.0.0/8")
    get_settings.cache_clear()
    request = _build_request(
        peer_ip="10.10.0.5",
        headers={"X-Real-IP": "198.51.100.9"},
    )

    ip_key = get_ip_key(request)

    assert ip_key == "198.51.100.9"


def test_get_ip_key_falls_back_to_peer_ip_when_xff_chain_is_all_trusted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "10.0.0.0/8")
    get_settings.cache_clear()
    request = _build_request(
        peer_ip="10.10.0.5",
        headers={"X-Forwarded-For": "10.20.0.1, 10.30.0.2"},
    )

    ip_key = get_ip_key(request)

    assert ip_key == "10.10.0.5"


def test_get_user_key_uses_access_token_subject(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(
        "SECRET_KEY",
        "test-secret-key-that-is-at-least-32-bytes",
    )
    get_settings.cache_clear()
    user_id = uuid4()
    request = _build_request(
        peer_ip="198.51.100.20",
        headers={"cookie": f"stima_access_token={create_access_token(subject=str(user_id))}"},
    )

    assert get_user_key(request) == f"user:{user_id}"


def test_get_user_key_falls_back_to_ip_when_access_token_is_missing() -> None:
    request = _build_request(peer_ip="198.51.100.20", headers={})

    assert get_user_key(request) == "ip:198.51.100.20"


def test_build_limiter_uses_memory_storage_when_redis_url_is_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("REDIS_URL", "")
    get_settings.cache_clear()
    limiter = build_limiter(get_settings())

    assert isinstance(limiter._storage, MemoryStorage)  # type: ignore[attr-defined]


def test_build_limiter_uses_redis_storage_when_redis_url_is_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    get_settings.cache_clear()

    limiter = build_limiter(get_settings())

    assert isinstance(limiter._storage, RedisStorage)  # type: ignore[attr-defined]
    get_settings.cache_clear()


def test_build_limiter_applies_configured_redis_key_prefix(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setenv("REDIS_KEY_PREFIX", " custom: ")
    get_settings.cache_clear()

    limiter = build_limiter(get_settings())

    assert isinstance(limiter._storage, RedisStorage)  # type: ignore[attr-defined]
    assert limiter._storage.key_prefix == "custom"  # type: ignore[attr-defined]


def test_configure_active_limiter_key_prefix_is_no_op_for_memory_backend(
    monkeypatch: pytest.MonkeyPatch,
    request: pytest.FixtureRequest,
) -> None:
    monkeypatch.setenv("REDIS_URL", "")
    get_settings.cache_clear()
    request.addfinalizer(get_settings.cache_clear)
    memory_limiter = build_limiter(get_settings())
    monkeypatch.setattr("app.shared.rate_limit.limiter", memory_limiter)

    configure_active_limiter_key_prefix("any-prefix")

    assert isinstance(memory_limiter._storage, MemoryStorage)  # type: ignore[attr-defined]
    assert not hasattr(memory_limiter._storage, "key_prefix")  # type: ignore[attr-defined]


@pytest.mark.skipif(
    _SKIP_REDIS_LIMITER_CONSTRUCTION,
    reason=(
        "Set STIMA_SKIP_EAGER_REDIS_LIMITER_TESTS=1 for environments whose Redis limiter "
        "construction eagerly connects."
    ),
)
def test_configure_active_limiter_key_prefix_updates_redis_storage(
    monkeypatch: pytest.MonkeyPatch,
    request: pytest.FixtureRequest,
) -> None:
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    get_settings.cache_clear()
    request.addfinalizer(get_settings.cache_clear)
    redis_limiter = build_limiter(get_settings())
    monkeypatch.setattr("app.shared.rate_limit.limiter", redis_limiter)

    configure_active_limiter_key_prefix("custom-test-prefix")

    assert isinstance(redis_limiter._storage, RedisStorage)  # type: ignore[attr-defined]
    assert redis_limiter._storage.key_prefix == "custom-test-prefix"  # type: ignore[attr-defined]


def test_build_limiter_logs_redacted_redis_url(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setenv("REDIS_URL", "rediss://default:secret-token@cache.example:6379/0")
    get_settings.cache_clear()

    with caplog.at_level(logging.INFO, logger="app.shared.rate_limit"):
        build_limiter(get_settings())

    assert "secret-token" not in caplog.text
    assert "rediss://***@cache.example:6379/0" in caplog.text


def test_production_settings_require_redis_url(monkeypatch: pytest.MonkeyPatch) -> None:
    """Production Settings validation requires REDIS_URL (runs before limiter backend)."""
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    monkeypatch.setenv("FRONTEND_URL", "https://app.stima.dev")
    monkeypatch.setenv("ALLOWED_HOSTS", "api.stima.dev")
    monkeypatch.setenv("REDIS_URL", "")
    get_settings.cache_clear()

    with pytest.raises(ValidationError, match="REDIS_URL must be set"):
        get_settings()


def test_resolve_limiter_backend_rejects_production_without_redis_url() -> None:
    """resolve_limiter_backend enforces Redis when environment is production (direct call)."""
    settings = Settings.model_construct(environment="production", redis_url=None)
    with pytest.raises(ValueError, match="REDIS_URL must be set"):
        resolve_limiter_backend(settings)


def test_resolve_limiter_backend_allows_production_memory_when_degraded_enabled() -> None:
    settings = Settings.model_construct(
        environment="production",
        redis_url=None,
        allow_redis_degraded_mode=True,
    )

    backend = resolve_limiter_backend(settings)

    assert backend.mode == "memory"
    assert backend.storage_uri == "memory://"


def test_resolve_limiter_backend_for_runtime_mode_forces_memory() -> None:
    settings = Settings.model_construct(
        environment="production",
        redis_url="redis://localhost:6379/0",
    )

    backend = resolve_limiter_backend_for_runtime_mode(
        settings,
        runtime_mode="memory",
        degraded_reason="redis_probe_failed",
    )

    assert backend.mode == "memory"
    assert backend.fallback_reason == "redis_probe_failed"


@pytest.mark.asyncio
async def test_extraction_control_manager_prefixes_redis_keys(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("REDIS_KEY_PREFIX", "stima_test:")
    get_settings.cache_clear()
    store = _RecordingExtractionStateStore()
    manager = ExtractionControlManager(store, settings=get_settings())
    user_id = uuid4()

    quota_reserved = await manager.reserve_daily_quota(user_id)
    lease = await manager.acquire_concurrency(user_id)

    assert quota_reserved is True
    assert store.reserve_calls == [f"stima_test:quota:extract:{user_id}"]
    assert store.acquire_calls == [f"stima_test:concurrency:extract:{user_id}"]
    assert lease is not None
    assert lease.concurrency_key == f"stima_test:concurrency:extract:{user_id}"


@pytest.mark.asyncio
async def test_redis_extraction_state_store_rotates_client_when_event_loop_changes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _FakeRedisClient:
        def __init__(self) -> None:
            self.closed = False

        async def eval(self, *_: object) -> int:
            return 1

        async def aclose(self) -> None:
            self.closed = True

    clients: list[_FakeRedisClient] = []

    def _fake_from_url(*_: object, **__: object) -> _FakeRedisClient:
        client = _FakeRedisClient()
        clients.append(client)
        return client

    first_loop = object()
    second_loop = object()
    loop_sequence = iter([first_loop, second_loop, second_loop])
    monkeypatch.setattr("app.shared.rate_limit.Redis.from_url", _fake_from_url)
    monkeypatch.setattr(
        "app.shared.rate_limit.asyncio.get_running_loop",
        lambda: next(loop_sequence),
    )

    store = RedisExtractionStateStore("redis://localhost:6379/0")

    assert await store.acquire_concurrency("stima:test", limit=1, expiry_seconds=60) is True
    assert await store.acquire_concurrency("stima:test", limit=1, expiry_seconds=60) is True
    assert len(clients) == 2
    assert clients[0].closed is True

    await store.aclose()
    assert clients[1].closed is True


def _build_request(peer_ip: str, headers: dict[str, str]) -> Request:
    raw_headers = [
        (name.lower().encode("latin-1"), value.encode("latin-1")) for name, value in headers.items()
    ]
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "headers": raw_headers,
        "client": (peer_ip, 12345),
        "server": ("testserver", 80),
    }
    return Request(scope)


class _RecordingExtractionStateStore(ExtractionStateStore):
    def __init__(self) -> None:
        self.reserve_calls: list[str] = []
        self.acquire_calls: list[str] = []

    async def reserve_daily_quota(self, key: str, *, limit: int, expiry_seconds: int) -> bool:
        self.reserve_calls.append(key)
        return True

    async def acquire_concurrency(self, key: str, *, limit: int, expiry_seconds: int) -> bool:
        self.acquire_calls.append(key)
        return True

    async def release_concurrency(self, key: str) -> None:
        return None
