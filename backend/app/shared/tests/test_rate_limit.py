"""Rate-limit IP key extraction tests."""

from __future__ import annotations

from collections.abc import Iterator
from uuid import uuid4

import pytest
from app.core.config import Settings, get_settings
from app.core.security import create_access_token
from app.shared.rate_limit import build_limiter, get_ip_key, get_user_key, resolve_limiter_backend
from limits.storage.memory import MemoryStorage
from limits.storage.redis import RedisStorage
from pydantic import ValidationError
from starlette.requests import Request


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
    monkeypatch.delenv("REDIS_URL", raising=False)
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


def test_production_settings_require_redis_url(monkeypatch: pytest.MonkeyPatch) -> None:
    """Production Settings validation requires REDIS_URL (runs before limiter backend)."""
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    monkeypatch.setenv("FRONTEND_URL", "https://app.stima.dev")
    monkeypatch.setenv("ALLOWED_HOSTS", "api.stima.dev")
    monkeypatch.delenv("REDIS_URL", raising=False)
    get_settings.cache_clear()

    with pytest.raises(ValidationError, match="REDIS_URL must be set"):
        get_settings()


def test_resolve_limiter_backend_rejects_production_without_redis_url() -> None:
    """resolve_limiter_backend enforces Redis when environment is production (direct call)."""
    settings = Settings.model_construct(environment="production", redis_url=None)
    with pytest.raises(ValueError, match="REDIS_URL must be set"):
        resolve_limiter_backend(settings)


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
