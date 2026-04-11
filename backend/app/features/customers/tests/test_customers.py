"""Customer API behavior tests for CRUD and ownership scoping."""

from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.features.auth.service import CSRF_COOKIE_NAME

pytestmark = pytest.mark.asyncio


async def test_get_customers_returns_empty_list_for_new_user(client: AsyncClient) -> None:
    await _register_and_login(client, _credentials())

    response = await client.get("/api/customers")

    assert response.status_code == 200
    assert response.json() == []


async def test_post_customers_creates_customer_with_required_name_only(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/customers",
        json={"name": "Alice Johnson"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["name"] == "Alice Johnson"
    assert payload["phone"] is None
    assert payload["email"] is None
    assert payload["address"] is None


async def test_post_customers_creates_customer_with_all_fields(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/customers",
        json={
            "name": "Bob Brown",
            "phone": "555-0102",
            "email": "bob@example.com",
            "address": "10 Main St",
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["name"] == "Bob Brown"
    assert payload["phone"] == "555-0102"
    assert payload["email"] == "bob@example.com"
    assert payload["address"] == "10 Main St"


async def test_get_customers_returns_only_authenticated_users_customers(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    await _create_customer(
        client,
        csrf_token,
        {"name": "Alice Johnson"},
    )
    await _create_customer(
        client,
        csrf_token,
        {"name": "Bob Brown"},
    )

    response = await client.get("/api/customers")

    assert response.status_code == 200
    names = {customer["name"] for customer in response.json()}
    assert names == {"Alice Johnson", "Bob Brown"}


async def test_get_customer_by_id_returns_owned_customer(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    created_customer = await _create_customer(
        client,
        csrf_token,
        {"name": "Alice Johnson"},
    )

    response = await client.get(f"/api/customers/{created_customer['id']}")

    assert response.status_code == 200
    assert response.json()["id"] == created_customer["id"]


async def test_get_customer_returns_404_for_nonexistent_id(client: AsyncClient) -> None:
    await _register_and_login(client, _credentials())

    response = await client.get(f"/api/customers/{uuid4()}")

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


async def test_patch_customer_updates_customer(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    created_customer = await _create_customer(
        client,
        csrf_token,
        {"name": "Alice Johnson"},
    )

    response = await client.patch(
        f"/api/customers/{created_customer['id']}",
        json={"name": "Alice Smith"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Alice Smith"


async def test_patch_customer_returns_404_for_nonexistent_id(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.patch(
        f"/api/customers/{uuid4()}",
        json={"name": "Ghost Customer"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


async def test_delete_customer_deletes_owned_customer_and_cascades_documents(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    created_customer = await _create_customer(
        client,
        csrf_token,
        {"name": "Alice Johnson"},
    )
    quote = await _create_quote_for_customer(
        client,
        csrf_token,
        customer_id=str(created_customer["id"]),
    )
    invoice = await _create_invoice_for_customer(
        client,
        csrf_token,
        customer_id=str(created_customer["id"]),
    )

    response = await client.delete(
        f"/api/customers/{created_customer['id']}",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 204
    assert response.content == b""

    customer_response = await client.get(f"/api/customers/{created_customer['id']}")
    assert customer_response.status_code == 404
    assert customer_response.json() == {"detail": "Not found"}

    quote_response = await client.get(f"/api/quotes/{quote['id']}")
    assert quote_response.status_code == 404
    assert quote_response.json() == {"detail": "Not found"}

    invoice_response = await client.get(f"/api/invoices/{invoice['id']}")
    assert invoice_response.status_code == 404
    assert invoice_response.json() == {"detail": "Not found"}


async def test_delete_customer_returns_404_for_nonexistent_id(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.delete(
        f"/api/customers/{uuid4()}",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


async def test_patch_customer_updates_only_provided_fields(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    created_customer = await _create_customer(
        client,
        csrf_token,
        {
            "name": "Alice Johnson",
            "phone": "555-0102",
            "email": "alice@example.com",
            "address": "10 Main St",
        },
    )

    response = await client.patch(
        f"/api/customers/{created_customer['id']}",
        json={"phone": "555-9999"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["name"] == "Alice Johnson"
    assert payload["phone"] == "555-9999"
    assert payload["email"] == "alice@example.com"
    assert payload["address"] == "10 Main St"


async def test_patch_customer_rejects_null_name(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    created_customer = await _create_customer(
        client,
        csrf_token,
        {"name": "Alice Johnson"},
    )

    response = await client.patch(
        f"/api/customers/{created_customer['id']}",
        json={"name": None},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422


async def test_get_customers_requires_authentication(client: AsyncClient) -> None:
    client.cookies.clear()

    response = await client.get("/api/customers")

    assert response.status_code == 401


async def test_post_customers_requires_authentication(client: AsyncClient) -> None:
    client.cookies.clear()
    client.cookies.set(CSRF_COOKIE_NAME, "csrf-token", path="/")

    response = await client.post(
        "/api/customers",
        json={"name": "Alice Johnson"},
        headers={"X-CSRF-Token": "csrf-token"},
    )

    assert response.status_code == 401


async def test_post_customers_requires_csrf(client: AsyncClient) -> None:
    await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/customers",
        json={"name": "Alice Johnson"},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_patch_customer_requires_csrf(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    created_customer = await _create_customer(
        client,
        csrf_token,
        {"name": "Alice Johnson"},
    )

    response = await client.patch(
        f"/api/customers/{created_customer['id']}",
        json={"name": "Alice Smith"},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_delete_customer_requires_csrf(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    created_customer = await _create_customer(
        client,
        csrf_token,
        {"name": "Alice Johnson"},
    )

    response = await client.delete(f"/api/customers/{created_customer['id']}")

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_get_customer_returns_404_for_different_users_customer(
    client: AsyncClient,
) -> None:
    csrf_token_user_a = await _register_and_login(client, _credentials())
    created_customer = await _create_customer(
        client,
        csrf_token_user_a,
        {"name": "Alice Johnson"},
    )

    await _register_and_login(client, _credentials())
    response = await client.get(f"/api/customers/{created_customer['id']}")

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


async def test_patch_customer_returns_404_for_different_users_customer(
    client: AsyncClient,
) -> None:
    csrf_token_user_a = await _register_and_login(client, _credentials())
    created_customer = await _create_customer(
        client,
        csrf_token_user_a,
        {"name": "Alice Johnson"},
    )

    csrf_token_user_b = await _register_and_login(client, _credentials())
    response = await client.patch(
        f"/api/customers/{created_customer['id']}",
        json={"name": "Hijacked Name"},
        headers={"X-CSRF-Token": csrf_token_user_b},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


async def test_delete_customer_returns_404_for_different_users_customer(
    client: AsyncClient,
) -> None:
    csrf_token_user_a = await _register_and_login(client, _credentials())
    created_customer = await _create_customer(
        client,
        csrf_token_user_a,
        {"name": "Alice Johnson"},
    )

    csrf_token_user_b = await _register_and_login(client, _credentials())
    response = await client.delete(
        f"/api/customers/{created_customer['id']}",
        headers={"X-CSRF-Token": csrf_token_user_b},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


async def test_post_customers_rejects_missing_name(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/customers",
        json={"email": "alice@example.com"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422


async def test_post_customers_rejects_empty_name(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/customers",
        json={"name": ""},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422


async def _register_and_login(client: AsyncClient, credentials: dict[str, str]) -> str:
    register_response = await client.post("/api/auth/register", json=credentials)
    assert register_response.status_code == 201
    login_response = await client.post("/api/auth/login", json=credentials)
    assert login_response.status_code == 200
    csrf_token = client.cookies.get(CSRF_COOKIE_NAME)
    assert csrf_token is not None
    return csrf_token


async def _create_customer(
    client: AsyncClient,
    csrf_token: str,
    payload: dict[str, object],
) -> dict[str, object]:
    response = await client.post(
        "/api/customers",
        json=payload,
        headers={"X-CSRF-Token": csrf_token},
    )
    assert response.status_code == 201
    return response.json()


async def _create_quote_for_customer(
    client: AsyncClient,
    csrf_token: str,
    *,
    customer_id: str,
) -> dict[str, object]:
    response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "title": "Cleanup quote",
            "transcript": "Spring cleanup scope",
            "line_items": [{"description": "Mulch", "details": None, "price": 125}],
            "total_amount": 125,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert response.status_code == 201
    return response.json()


async def _create_invoice_for_customer(
    client: AsyncClient,
    csrf_token: str,
    *,
    customer_id: str,
) -> dict[str, object]:
    response = await client.post(
        "/api/invoices",
        json={
            "customer_id": customer_id,
            "title": "Cleanup invoice",
            "transcript": "Invoice for spring cleanup",
            "line_items": [{"description": "Mulch", "details": None, "price": 125}],
            "total_amount": 125,
            "notes": None,
            "source_type": "text",
        },
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
