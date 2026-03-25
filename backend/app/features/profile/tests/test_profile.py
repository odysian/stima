"""Profile API behavior tests for onboarding and profile updates."""

from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.features.auth.service import CSRF_COOKIE_NAME

pytestmark = pytest.mark.asyncio


async def test_get_profile_returns_authenticated_user_profile(client: AsyncClient) -> None:
    credentials = _credentials()
    await _register_and_login(client, credentials)

    response = await client.get("/api/profile")

    assert response.status_code == 200
    payload = response.json()
    assert payload["email"] == credentials["email"]
    assert payload["first_name"] is None
    assert payload["last_name"] is None
    assert payload["business_name"] is None
    assert payload["trade_type"] is None
    assert payload["timezone"] is None
    assert payload["is_onboarded"] is False


async def test_get_profile_requires_authentication(client: AsyncClient) -> None:
    client.cookies.clear()

    response = await client.get("/api/profile")

    assert response.status_code == 401


async def test_patch_profile_updates_onboarding_fields(client: AsyncClient) -> None:
    credentials = _credentials()
    await _register_and_login(client, credentials)
    csrf_token = client.cookies.get(CSRF_COOKIE_NAME)
    assert csrf_token is not None

    payload = {
        "business_name": "Summit Exterior Care",
        "first_name": "Jane",
        "last_name": "Doe",
        "trade_type": "Plumber",
        "timezone": "America/New_York",
    }

    response = await client.patch(
        "/api/profile",
        json=payload,
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["business_name"] == payload["business_name"]
    assert body["first_name"] == payload["first_name"]
    assert body["last_name"] == payload["last_name"]
    assert body["trade_type"] == payload["trade_type"]
    assert body["timezone"] == payload["timezone"]
    assert body["is_onboarded"] is True

    get_response = await client.get("/api/profile")
    assert get_response.status_code == 200
    assert get_response.json()["timezone"] == "America/New_York"


async def test_patch_profile_requires_business_name(client: AsyncClient) -> None:
    await _register_and_login(client, _credentials())
    csrf_token = client.cookies.get(CSRF_COOKIE_NAME)
    assert csrf_token is not None

    response = await client.patch(
        "/api/profile",
        json={
            "first_name": "Jane",
            "last_name": "Doe",
            "trade_type": "Landscaper",
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422


async def test_patch_profile_rejects_empty_first_name(client: AsyncClient) -> None:
    await _register_and_login(client, _credentials())
    csrf_token = client.cookies.get(CSRF_COOKIE_NAME)
    assert csrf_token is not None

    response = await client.patch(
        "/api/profile",
        json={
            "business_name": "Summit Exterior Care",
            "first_name": "",
            "last_name": "Doe",
            "trade_type": "Landscaper",
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422


async def test_patch_profile_rejects_invalid_trade_type(client: AsyncClient) -> None:
    await _register_and_login(client, _credentials())
    csrf_token = client.cookies.get(CSRF_COOKIE_NAME)
    assert csrf_token is not None

    response = await client.patch(
        "/api/profile",
        json={
            "business_name": "Summit Exterior Care",
            "first_name": "Jane",
            "last_name": "Doe",
            "trade_type": "InvalidType",
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422
    assert any(error["loc"][-1] == "trade_type" for error in response.json()["detail"])


async def test_patch_profile_rejects_invalid_timezone(client: AsyncClient) -> None:
    await _register_and_login(client, _credentials())
    csrf_token = client.cookies.get(CSRF_COOKIE_NAME)
    assert csrf_token is not None

    response = await client.patch(
        "/api/profile",
        json={
            "business_name": "Summit Exterior Care",
            "first_name": "Jane",
            "last_name": "Doe",
            "trade_type": "Landscaper",
            "timezone": "Mars/Olympus_Mons",
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422
    assert any(error["loc"][-1] == "timezone" for error in response.json()["detail"])


async def test_patch_profile_rejects_partial_update_and_preserves_existing_values(
    client: AsyncClient,
) -> None:
    credentials = _credentials()
    await _register_and_login(client, credentials)
    csrf_token = client.cookies.get(CSRF_COOKIE_NAME)
    assert csrf_token is not None

    initial_response = await client.patch(
        "/api/profile",
        json={
            "business_name": "Summit Exterior Care",
            "first_name": "Jane",
            "last_name": "Doe",
            "trade_type": "Landscaper",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert initial_response.status_code == 200

    partial_response = await client.patch(
        "/api/profile",
        json={"first_name": "Janet"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert partial_response.status_code == 422

    profile_response = await client.get("/api/profile")
    assert profile_response.status_code == 200
    payload = profile_response.json()
    assert payload["business_name"] == "Summit Exterior Care"
    assert payload["first_name"] == "Jane"
    assert payload["last_name"] == "Doe"
    assert payload["trade_type"] == "Landscaper"


async def test_patch_profile_preserves_saved_timezone_when_field_is_omitted(
    client: AsyncClient,
) -> None:
    credentials = _credentials()
    await _register_and_login(client, credentials)
    csrf_token = client.cookies.get(CSRF_COOKIE_NAME)
    assert csrf_token is not None

    initial_response = await client.patch(
        "/api/profile",
        json={
            "business_name": "Summit Exterior Care",
            "first_name": "Jane",
            "last_name": "Doe",
            "trade_type": "Landscaper",
            "timezone": "America/New_York",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert initial_response.status_code == 200

    second_response = await client.patch(
        "/api/profile",
        json={
            "business_name": "Summit Exterior Care",
            "first_name": "Jane",
            "last_name": "Doe",
            "trade_type": "Landscaper",
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert second_response.status_code == 200
    assert second_response.json()["timezone"] == "America/New_York"


async def test_patch_profile_requires_authentication(client: AsyncClient) -> None:
    client.cookies.clear()
    client.cookies.set(CSRF_COOKIE_NAME, "csrf", path="/")

    response = await client.patch(
        "/api/profile",
        json={
            "business_name": "Summit Exterior Care",
            "first_name": "Jane",
            "last_name": "Doe",
            "trade_type": "Landscaper",
        },
        headers={"X-CSRF-Token": "csrf"},
    )

    assert response.status_code == 401


async def test_patch_profile_requires_csrf_header(client: AsyncClient) -> None:
    await _register_and_login(client, _credentials())

    response = await client.patch(
        "/api/profile",
        json={
            "business_name": "Summit Exterior Care",
            "first_name": "Jane",
            "last_name": "Doe",
            "trade_type": "Landscaper",
        },
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_me_reflects_onboarding_state_after_profile_update(client: AsyncClient) -> None:
    credentials = _credentials()
    await _register_and_login(client, credentials)
    csrf_token = client.cookies.get(CSRF_COOKIE_NAME)
    assert csrf_token is not None

    update_response = await client.patch(
        "/api/profile",
        json={
            "business_name": "Summit Exterior Care",
            "first_name": "Jane",
            "last_name": "Doe",
            "trade_type": "Landscaper",
            "timezone": "America/New_York",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert update_response.status_code == 200

    me_response = await client.get("/api/auth/me")
    assert me_response.status_code == 200
    assert me_response.json()["is_onboarded"] is True
    assert me_response.json()["timezone"] == "America/New_York"


async def _register_and_login(client: AsyncClient, credentials: dict[str, str]) -> None:
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
