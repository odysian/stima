"""Application boundary middleware tests."""

from __future__ import annotations

from collections.abc import AsyncGenerator, Iterator

import pytest
import pytest_asyncio
from app.core.config import get_settings
from app.main import create_app
from httpx import ASGITransport, AsyncClient


@pytest.fixture(autouse=True)
def _required_settings(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-that-is-at-least-32-bytes")
    monkeypatch.setenv("GCS_BUCKET_NAME", "stima-test-logos")
    monkeypatch.delenv("ALLOWED_HOSTS", raising=False)
    monkeypatch.delenv("ENABLE_HTTPS_REDIRECT", raising=False)
    monkeypatch.delenv("TRUSTED_PROXY_IPS", raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest_asyncio.fixture()
async def boundary_client() -> AsyncGenerator[AsyncClient, None]:
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://api.stima.dev") as client:
        yield client


async def test_health_includes_security_headers(boundary_client: AsyncClient) -> None:
    response = await boundary_client.get("/health", headers={"host": "api.stima.dev"})

    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert response.headers["x-frame-options"] == "DENY"
    assert "strict-transport-security" not in response.headers


async def test_invalid_host_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ALLOWED_HOSTS", "api.stima.dev")
    get_settings.cache_clear()

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://api.stima.dev") as client:
        response = await client.get("/health", headers={"host": "evil.example"})

    assert response.status_code == 400


async def test_trusted_proxy_headers_prevent_https_redirect_loops(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    monkeypatch.setenv("FRONTEND_URL", "https://stima.odysian.dev")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setenv("ALLOWED_HOSTS", "api.stima.odysian.dev,127.0.0.1")
    monkeypatch.setenv("ENABLE_HTTPS_REDIRECT", "true")
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "127.0.0.1")
    get_settings.cache_clear()

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://api.stima.odysian.dev",
        follow_redirects=False,
    ) as client:
        response = await client.get(
            "/health",
            headers={
                "host": "api.stima.odysian.dev",
                "x-forwarded-proto": "https",
                "x-forwarded-for": "198.51.100.7, 127.0.0.1",
            },
        )

    assert response.status_code == 200
    assert response.headers["strict-transport-security"] == "max-age=63072000; includeSubDomains"


async def test_https_redirect_ignores_untrusted_forwarded_proto(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ALLOWED_HOSTS", "api.stima.dev")
    monkeypatch.setenv("ENABLE_HTTPS_REDIRECT", "true")
    get_settings.cache_clear()

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://api.stima.dev",
        follow_redirects=False,
    ) as client:
        response = await client.get(
            "/health",
            headers={
                "host": "api.stima.dev",
                "x-forwarded-proto": "https",
            },
        )

    assert response.status_code == 307
    assert response.headers["location"] == "https://api.stima.dev/health"
