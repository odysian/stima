"""Rate-limit IP key extraction tests."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from starlette.requests import Request

from app.core.config import get_settings
from app.shared.rate_limit import get_ip_key


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


def _build_request(peer_ip: str, headers: dict[str, str]) -> Request:
    raw_headers = [
        (name.lower().encode("latin-1"), value.encode("latin-1"))
        for name, value in headers.items()
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
