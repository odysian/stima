"""Application boundary middleware tests."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator, Iterator
from types import SimpleNamespace
from unittest.mock import AsyncMock

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


@pytest.mark.asyncio
async def test_app_lifespan_closes_extraction_controls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    aclose = AsyncMock()
    idempotency_aclose = AsyncMock()

    class _CachedStoreFactory:
        def __call__(self) -> object:
            return SimpleNamespace(aclose=idempotency_aclose)

        def cache_info(self) -> SimpleNamespace:
            return SimpleNamespace(currsize=1)

    monkeypatch.setattr("app.main.get_idempotency_store", _CachedStoreFactory())
    monkeypatch.setattr("app.main.extraction_controls.aclose", aclose)

    app = create_app()

    async with app.router.lifespan_context(app):
        pass

    idempotency_aclose.assert_awaited_once()
    aclose.assert_awaited_once()


@pytest.mark.asyncio
async def test_app_lifespan_degrades_when_arq_pool_startup_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    get_settings.cache_clear()
    monkeypatch.setattr(
        "app.main.create_pool",
        AsyncMock(side_effect=RuntimeError("redis unavailable")),
    )

    app = create_app()

    async with app.router.lifespan_context(app):
        assert app.state.arq_pool is None


@pytest.mark.asyncio
async def test_app_lifespan_starts_and_cancels_stale_job_reaper(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    started = asyncio.Event()
    cancelled = asyncio.Event()

    async def _fake_reaper(**_: object) -> None:
        started.set()
        try:
            await asyncio.Future()
        except asyncio.CancelledError:
            cancelled.set()
            raise

    monkeypatch.setattr("app.main.run_stale_extraction_job_reaper", _fake_reaper)

    app = create_app()

    async with app.router.lifespan_context(app):
        await asyncio.wait_for(started.wait(), timeout=1)
        assert app.state.stale_job_reaper_task is not None

    assert cancelled.is_set()
