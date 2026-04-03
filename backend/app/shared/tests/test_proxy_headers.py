"""Trusted proxy middleware tests."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from app.core.config import get_settings
from app.shared.proxy_headers import TrustedProxyHeadersMiddleware
from starlette.types import Message, Receive, Scope, Send


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


@pytest.mark.asyncio
async def test_trusted_proxy_headers_preserve_peer_port_and_merge_duplicate_forwarded_headers() -> (
    None
):
    captured_scope: Scope = {}

    async def app(scope: Scope, receive: Receive, send: Send) -> None:
        captured_scope.update(scope)
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    middleware = TrustedProxyHeadersMiddleware(app, trusted_proxy_ips=["127.0.0.1"])

    await middleware(
        _build_scope(
            peer_ip="127.0.0.1",
            peer_port=4321,
            headers=[
                ("X-Forwarded-Proto", "https"),
                ("X-Forwarded-Proto", "http"),
                ("X-Forwarded-For", "198.51.100.7"),
                ("X-Forwarded-For", "127.0.0.1"),
            ],
        ),
        _receive,
        _send,
    )

    assert captured_scope["scheme"] == "https"
    assert captured_scope["client"] == ("198.51.100.7", 4321)


@pytest.mark.asyncio
async def test_trusted_proxy_headers_preserve_peer_port_for_x_real_ip() -> None:
    captured_scope: Scope = {}

    async def app(scope: Scope, receive: Receive, send: Send) -> None:
        captured_scope.update(scope)
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    middleware = TrustedProxyHeadersMiddleware(app, trusted_proxy_ips=["127.0.0.1"])

    await middleware(
        _build_scope(
            peer_ip="127.0.0.1",
            peer_port=4321,
            headers=[("X-Real-IP", "198.51.100.9")],
        ),
        _receive,
        _send,
    )

    assert captured_scope["client"] == ("198.51.100.9", 4321)


def _build_scope(
    *,
    peer_ip: str,
    peer_port: int,
    headers: list[tuple[str, str]],
) -> Scope:
    raw_headers = [
        (name.lower().encode("latin-1"), value.encode("latin-1")) for name, value in headers
    ]
    return {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "headers": raw_headers,
        "client": (peer_ip, peer_port),
        "server": ("testserver", 80),
    }


async def _receive() -> Message:
    return {"type": "http.request", "body": b"", "more_body": False}


async def _send(message: Message) -> None:
    del message
