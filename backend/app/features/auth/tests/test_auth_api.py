"""Auth API behavior tests for cookies, CSRF, and refresh rotation."""

from __future__ import annotations

from collections.abc import Iterator
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_engine, get_session_maker
from app.core.security import hash_token
from app.features.auth.models import RefreshToken, User
from app.features.auth.service import ACCESS_COOKIE_NAME, CSRF_COOKIE_NAME, REFRESH_COOKIE_NAME

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _configure_auth_settings(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv(
        "SECRET_KEY",
        "test-secret-key-that-is-at-least-32-bytes",
    )
    monkeypatch.setenv("COOKIE_SECURE", "false")
    monkeypatch.setenv("COOKIE_SAMESITE", "lax")
    monkeypatch.setenv("COOKIE_DOMAIN", "")
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:5173")
    get_settings.cache_clear()
    get_engine.cache_clear()
    get_session_maker.cache_clear()
    yield
    get_session_maker.cache_clear()
    get_engine.cache_clear()
    get_settings.cache_clear()


async def test_login_sets_auth_cookies_and_returns_csrf(client: AsyncClient) -> None:
    credentials = _credentials()
    register_response = await client.post("/api/auth/register", json=credentials)
    assert register_response.status_code == 201

    login_response = await client.post("/api/auth/login", json=credentials)
    assert login_response.status_code == 200
    payload = login_response.json()
    assert isinstance(payload["csrf_token"], str)
    assert payload["csrf_token"]

    set_cookie_values = login_response.headers.get_list("set-cookie")
    assert any(f"{ACCESS_COOKIE_NAME}=" in value for value in set_cookie_values)
    assert any(f"{REFRESH_COOKIE_NAME}=" in value for value in set_cookie_values)
    assert any(f"{CSRF_COOKIE_NAME}=" in value for value in set_cookie_values)
    access_cookie = _cookie_header(set_cookie_values, ACCESS_COOKIE_NAME)
    refresh_cookie = _cookie_header(set_cookie_values, REFRESH_COOKIE_NAME)
    csrf_cookie = _cookie_header(set_cookie_values, CSRF_COOKIE_NAME)
    assert "Path=/api/" in access_cookie
    assert "Path=/api/auth/" in refresh_cookie
    assert "Path=/" in csrf_cookie


async def test_login_uses_env_configured_prod_cookie_domain(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("COOKIE_SECURE", "true")
    monkeypatch.setenv("COOKIE_DOMAIN", ".stima.odysian.dev")
    get_settings.cache_clear()

    credentials = _credentials()
    register_response = await client.post("/api/auth/register", json=credentials)
    assert register_response.status_code == 201

    login_response = await client.post("/api/auth/login", json=credentials)
    assert login_response.status_code == 200

    set_cookie_values = login_response.headers.get_list("set-cookie")
    assert all("Domain=.stima.odysian.dev" in value for value in set_cookie_values)


async def test_refresh_rejects_missing_csrf_header(client: AsyncClient) -> None:
    await _register_and_login(client, _credentials())

    refresh_response = await client.post("/api/auth/refresh")

    assert refresh_response.status_code == 403
    assert refresh_response.json() == {"detail": "CSRF token missing"}


async def test_refresh_rejects_csrf_mismatch(client: AsyncClient) -> None:
    await _register_and_login(client, _credentials())

    refresh_response = await client.post(
        "/api/auth/refresh",
        headers={"X-CSRF-Token": "different-token"},
    )

    assert refresh_response.status_code == 403
    assert refresh_response.json() == {"detail": "CSRF token mismatch"}


async def test_refresh_rotates_token_and_soft_revokes_consumed_token(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _register_and_login(client, _credentials())
    old_refresh_token = client.cookies.get(REFRESH_COOKIE_NAME)
    csrf_token = client.cookies.get(CSRF_COOKIE_NAME)
    assert old_refresh_token is not None
    assert csrf_token is not None

    refresh_response = await client.post(
        "/api/auth/refresh",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert refresh_response.status_code == 200
    new_refresh_token = client.cookies.get(REFRESH_COOKIE_NAME)
    assert new_refresh_token is not None
    assert new_refresh_token != old_refresh_token

    consumed_row = await db_session.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(old_refresh_token))
    )
    replacement_row = await db_session.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(new_refresh_token))
    )

    assert consumed_row is not None
    assert consumed_row.revoked_at is not None
    assert replacement_row is not None
    assert replacement_row.revoked_at is None


async def test_refresh_replay_revokes_token_family(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _register_and_login(client, _credentials())
    original_refresh_token = client.cookies.get(REFRESH_COOKIE_NAME)
    csrf_token = client.cookies.get(CSRF_COOKIE_NAME)
    assert original_refresh_token is not None
    assert csrf_token is not None

    first_refresh = await client.post(
        "/api/auth/refresh",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert first_refresh.status_code == 200
    rotated_refresh_token = client.cookies.get(REFRESH_COOKIE_NAME)
    rotated_csrf_token = client.cookies.get(CSRF_COOKIE_NAME)
    assert rotated_refresh_token is not None
    assert rotated_csrf_token is not None

    client.cookies.set(REFRESH_COOKIE_NAME, original_refresh_token, path="/api/auth/")
    replay_response = await client.post(
        "/api/auth/refresh",
        headers={"X-CSRF-Token": rotated_csrf_token},
    )
    assert replay_response.status_code == 401

    client.cookies.set(REFRESH_COOKIE_NAME, rotated_refresh_token, path="/api/auth/")
    second_response = await client.post(
        "/api/auth/refresh",
        headers={"X-CSRF-Token": rotated_csrf_token},
    )
    assert second_response.status_code == 401

    token_rows = (
        await db_session.scalars(
            select(RefreshToken).where(
                RefreshToken.token_hash.in_(
                    [
                        hash_token(original_refresh_token),
                        hash_token(rotated_refresh_token),
                    ]
                )
            )
        )
    ).all()
    assert token_rows
    assert all(row.revoked_at is not None for row in token_rows)


async def test_logout_clears_auth_cookies_and_revokes_refresh_token(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _register_and_login(client, _credentials())
    active_refresh_token = client.cookies.get(REFRESH_COOKIE_NAME)
    csrf_token = client.cookies.get(CSRF_COOKIE_NAME)
    assert active_refresh_token is not None
    assert csrf_token is not None

    logout_response = await client.post(
        "/api/auth/logout",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert logout_response.status_code == 204
    set_cookie_values = logout_response.headers.get_list("set-cookie")
    assert any(
        f"{ACCESS_COOKIE_NAME}=" in value and "Path=/api/" in value
        for value in set_cookie_values
    )
    assert any(
        f"{ACCESS_COOKIE_NAME}=" in value and "Path=/" in value
        for value in set_cookie_values
    )
    assert any(
        f"{REFRESH_COOKIE_NAME}=" in value and "Path=/api/auth/" in value
        for value in set_cookie_values
    )
    assert any(
        f"{REFRESH_COOKIE_NAME}=" in value and "Path=/" in value
        for value in set_cookie_values
    )
    assert ACCESS_COOKIE_NAME not in client.cookies
    assert REFRESH_COOKIE_NAME not in client.cookies
    assert CSRF_COOKIE_NAME not in client.cookies

    revoked_row = await db_session.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == hash_token(active_refresh_token)
        )
    )
    assert revoked_row is not None
    assert revoked_row.revoked_at is not None


async def test_me_returns_authenticated_user(client: AsyncClient) -> None:
    credentials = _credentials()
    await _register_and_login(client, credentials)

    me_response = await client.get("/api/auth/me")

    assert me_response.status_code == 200
    payload = me_response.json()
    assert payload["email"] == credentials["email"]
    assert payload["is_active"] is True


async def test_me_requires_authentication(client: AsyncClient) -> None:
    client.cookies.clear()

    response = await client.get("/api/auth/me")

    assert response.status_code == 401


async def test_login_rejects_inactive_user_with_generic_error(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    credentials = _credentials()
    register_response = await client.post("/api/auth/register", json=credentials)
    assert register_response.status_code == 201

    user = await db_session.scalar(select(User).where(User.email == credentials["email"]))
    assert user is not None
    user.is_active = False
    await db_session.flush()

    login_response = await client.post("/api/auth/login", json=credentials)

    assert login_response.status_code == 401
    assert login_response.json() == {"detail": "Invalid credentials"}


async def _register_and_login(
    client: AsyncClient,
    credentials: dict[str, str],
) -> None:
    register_response = await client.post("/api/auth/register", json=credentials)
    assert register_response.status_code == 201
    login_response = await client.post("/api/auth/login", json=credentials)
    assert login_response.status_code == 200


def _credentials() -> dict[str, str]:
    suffix = uuid4().hex[:12]
    return {
        "email": f"user-{suffix}@example.com",
        "password": "StrongPass123!",
    }


def _cookie_header(set_cookie_values: list[str], cookie_name: str) -> str:
    for value in set_cookie_values:
        if value.startswith(f"{cookie_name}="):
            return value
    raise AssertionError(f"Cookie {cookie_name} not found in set-cookie headers")
