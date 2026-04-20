"""Line-item catalog API behavior tests for CRUD and ownership scoping."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.features.auth.service import CSRF_COOKIE_NAME

pytestmark = pytest.mark.asyncio


async def test_line_item_catalog_crud_flow(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    create_response = await client.post(
        "/api/line-item-catalog",
        json={
            "title": "  Spring Cleanup  ",
            "details": None,
            "default_price": None,
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert create_response.status_code == 201
    created_item = create_response.json()
    item_id = created_item["id"]
    assert created_item["title"] == "Spring Cleanup"
    assert created_item["details"] is None
    assert created_item["default_price"] is None

    list_response = await client.get("/api/line-item-catalog")
    assert list_response.status_code == 200
    listed_items = list_response.json()
    assert len(listed_items) == 1
    assert listed_items[0]["id"] == item_id

    update_response = await client.patch(
        f"/api/line-item-catalog/{item_id}",
        json={
            "title": "  Mulch Refresh  ",
            "details": "Front beds and tree rings",
            "default_price": 225.5,
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert update_response.status_code == 200
    updated_item = update_response.json()
    assert updated_item["title"] == "Mulch Refresh"
    assert updated_item["details"] == "Front beds and tree rings"
    assert updated_item["default_price"] == "225.50"

    delete_response = await client.delete(
        f"/api/line-item-catalog/{item_id}",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert delete_response.status_code == 204
    assert delete_response.content == b""

    final_list_response = await client.get("/api/line-item-catalog")
    assert final_list_response.status_code == 200
    assert final_list_response.json() == []


async def test_list_line_item_catalog_returns_newest_first(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    first_item = await _create_catalog_item(
        client,
        csrf_token,
        {"title": "First item", "details": None, "default_price": 10},
    )
    second_item = await _create_catalog_item(
        client,
        csrf_token,
        {"title": "Second item", "details": None, "default_price": 20},
    )

    response = await client.get("/api/line-item-catalog")

    assert response.status_code == 200
    payload = response.json()
    assert {item["id"] for item in payload} == {first_item["id"], second_item["id"]}

    created_at_values = [datetime.fromisoformat(item["created_at"]) for item in payload]
    assert created_at_values == sorted(created_at_values, reverse=True)


async def test_list_line_item_catalog_is_scoped_to_authenticated_user(
    client: AsyncClient,
) -> None:
    csrf_token_user_a = await _register_and_login(client, _credentials())
    await _create_catalog_item(
        client,
        csrf_token_user_a,
        {"title": "User A item", "details": None, "default_price": 33},
    )

    await _register_and_login(client, _credentials())
    response = await client.get("/api/line-item-catalog")

    assert response.status_code == 200
    assert response.json() == []


async def test_patch_line_item_catalog_returns_404_for_different_users_item(
    client: AsyncClient,
) -> None:
    csrf_token_user_a = await _register_and_login(client, _credentials())
    created_item = await _create_catalog_item(
        client,
        csrf_token_user_a,
        {"title": "User A item", "details": None, "default_price": 99},
    )

    csrf_token_user_b = await _register_and_login(client, _credentials())
    response = await client.patch(
        f"/api/line-item-catalog/{created_item['id']}",
        json={"title": "Hijacked"},
        headers={"X-CSRF-Token": csrf_token_user_b},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


async def test_delete_line_item_catalog_returns_404_for_different_users_item(
    client: AsyncClient,
) -> None:
    csrf_token_user_a = await _register_and_login(client, _credentials())
    created_item = await _create_catalog_item(
        client,
        csrf_token_user_a,
        {"title": "User A item", "details": None, "default_price": 99},
    )

    csrf_token_user_b = await _register_and_login(client, _credentials())
    response = await client.delete(
        f"/api/line-item-catalog/{created_item['id']}",
        headers={"X-CSRF-Token": csrf_token_user_b},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


async def test_post_line_item_catalog_rejects_blank_title(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/line-item-catalog",
        json={"title": "   ", "details": None, "default_price": 12},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422


async def test_patch_line_item_catalog_rejects_blank_title(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    created_item = await _create_catalog_item(
        client,
        csrf_token,
        {"title": "Original item", "details": None, "default_price": 99},
    )

    response = await client.patch(
        f"/api/line-item-catalog/{created_item['id']}",
        json={"title": " "},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422


async def test_post_line_item_catalog_rejects_negative_default_price(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/line-item-catalog",
        json={"title": "Cleanup", "details": "notes", "default_price": -1},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422


async def test_patch_line_item_catalog_rejects_negative_default_price(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    created_item = await _create_catalog_item(
        client,
        csrf_token,
        {"title": "Cleanup", "details": "notes", "default_price": 10},
    )

    response = await client.patch(
        f"/api/line-item-catalog/{created_item['id']}",
        json={"default_price": -1},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422


async def test_post_line_item_catalog_accepts_nullable_details_and_default_price(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/line-item-catalog",
        json={"title": "Seasonal Touch-up", "details": None, "default_price": None},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["details"] is None
    assert payload["default_price"] is None


async def test_get_line_item_catalog_requires_authentication(client: AsyncClient) -> None:
    client.cookies.clear()

    response = await client.get("/api/line-item-catalog")

    assert response.status_code == 401


async def _register_and_login(client: AsyncClient, credentials: dict[str, str]) -> str:
    register_response = await client.post("/api/auth/register", json=credentials)
    assert register_response.status_code == 201
    login_response = await client.post("/api/auth/login", json=credentials)
    assert login_response.status_code == 200
    csrf_token = client.cookies.get(CSRF_COOKIE_NAME)
    assert csrf_token is not None
    return csrf_token


async def _create_catalog_item(
    client: AsyncClient,
    csrf_token: str,
    payload: dict[str, object],
) -> dict[str, object]:
    response = await client.post(
        "/api/line-item-catalog",
        json=payload,
        headers={"X-CSRF-Token": csrf_token},
    )
    assert response.status_code == 201
    return response.json()


def _credentials() -> dict[str, str]:
    suffix = uuid4().hex[:12]
    return {
        "email": f"user-{suffix}@example.com",
        "password": "StrongPass123!",
    }
