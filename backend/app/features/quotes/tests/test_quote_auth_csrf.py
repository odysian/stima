"""Quote and invoice auth/CSRF transport behavior tests."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.auth.service import CSRF_COOKIE_NAME
from app.features.quotes.tests import test_quotes as quotes_test_module
from app.features.quotes.tests.support.helpers import (
    _create_approved_invoice,
    _create_customer,
    _create_quote,
    _credentials,
    _register_and_login,
)

pytestmark = pytest.mark.asyncio

# Reuse existing fixture wiring/helpers from test_quotes to preserve behavior.
_reset_email_delivery_fallback_cache = quotes_test_module._reset_email_delivery_fallback_cache
_override_storage_service_dependency = quotes_test_module._override_storage_service_dependency
_override_quote_service_dependency = quotes_test_module._override_quote_service_dependency
_override_extraction_service_dependency = quotes_test_module._override_extraction_service_dependency
_reset_rate_limiter = quotes_test_module._reset_rate_limiter


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("get", "/api/quotes", None),
        ("get", "/api/quotes/00000000-0000-0000-0000-000000000000", None),
        ("post", "/api/quotes/convert-notes", {"notes": "notes"}),
        ("post", "/api/quotes/manual-draft", {}),
        (
            "post",
            "/api/quotes",
            {
                "customer_id": "00000000-0000-0000-0000-000000000000",
                "transcript": "notes",
                "line_items": [{"description": "x", "details": None, "price": None}],
                "total_amount": None,
                "notes": None,
                "source_type": "text",
            },
        ),
        (
            "patch",
            "/api/quotes/00000000-0000-0000-0000-000000000000",
            {"notes": "updated"},
        ),
        (
            "post",
            "/api/quotes/bulk-action",
            {"action": "archive", "ids": ["00000000-0000-0000-0000-000000000000"]},
        ),
        ("delete", "/api/quotes/00000000-0000-0000-0000-000000000000", None),
        ("post", "/api/quotes/00000000-0000-0000-0000-000000000000/duplicate", None),
        ("post", "/api/quotes/00000000-0000-0000-0000-000000000000/pdf", None),
        ("post", "/api/quotes/00000000-0000-0000-0000-000000000000/share", None),
        ("post", "/api/quotes/00000000-0000-0000-0000-000000000000/send-email", None),
        ("post", "/api/quotes/00000000-0000-0000-0000-000000000000/mark-won", None),
        ("post", "/api/quotes/00000000-0000-0000-0000-000000000000/mark-lost", None),
    ],
)
async def test_all_quote_endpoints_require_authentication(
    client: AsyncClient,
    method: str,
    path: str,
    payload: dict[str, object] | None,
) -> None:
    client.cookies.clear()
    client.cookies.set(CSRF_COOKIE_NAME, "csrf", path="/")

    headers = {"X-CSRF-Token": "csrf"}
    request_method = getattr(client, method)
    if payload is None:
        response = await request_method(path, headers=headers)
    else:
        response = await request_method(path, json=payload, headers=headers)

    assert response.status_code == 401


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        (
            "post",
            "/api/invoices",
            {
                "customer_id": "00000000-0000-0000-0000-000000000000",
                "transcript": "notes",
                "line_items": [{"description": "x", "details": None, "price": None}],
                "total_amount": None,
                "notes": None,
                "source_type": "text",
            },
        ),
        ("get", "/api/invoices/00000000-0000-0000-0000-000000000000", None),
        (
            "post",
            "/api/invoices/bulk-action",
            {"action": "archive", "ids": ["00000000-0000-0000-0000-000000000000"]},
        ),
        (
            "patch",
            "/api/invoices/00000000-0000-0000-0000-000000000000",
            {"due_date": "2026-05-01"},
        ),
        ("post", "/api/invoices/00000000-0000-0000-0000-000000000000/pdf", None),
        ("post", "/api/invoices/00000000-0000-0000-0000-000000000000/share", None),
        ("post", "/api/invoices/00000000-0000-0000-0000-000000000000/send-email", None),
    ],
)
async def test_all_invoice_endpoints_require_authentication(
    client: AsyncClient,
    method: str,
    path: str,
    payload: dict[str, object] | None,
) -> None:
    client.cookies.clear()
    client.cookies.set(CSRF_COOKIE_NAME, "csrf", path="/")

    headers = {"X-CSRF-Token": "csrf"}
    request_method = getattr(client, method)
    if payload is None:
        response = await request_method(path, headers=headers)
    else:
        response = await request_method(path, json=payload, headers=headers)

    assert response.status_code == 401


async def test_extract_combined_requires_authentication(client: AsyncClient) -> None:
    client.cookies.clear()
    client.cookies.set(CSRF_COOKIE_NAME, "csrf", path="/")

    response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "needs auth"))],
        headers={"X-CSRF-Token": "csrf"},
    )

    assert response.status_code == 401


async def test_convert_notes_requires_csrf(client: AsyncClient) -> None:
    await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/convert-notes",
        json={"notes": "mulch and edging"},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_extract_combined_requires_csrf(client: AsyncClient) -> None:
    await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "mulch and edging"))],
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_create_quote_requires_csrf(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "quote transcript",
            "line_items": [{"description": "line item", "details": None, "price": None}],
            "total_amount": None,
            "notes": None,
            "source_type": "text",
        },
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_patch_quote_requires_csrf(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "quote transcript",
            "line_items": [{"description": "line item", "details": None, "price": None}],
            "total_amount": None,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    quote_id = create_response.json()["id"]

    response = await client.patch(
        f"/api/quotes/{quote_id}",
        json={"notes": "updated"},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_delete_quote_requires_csrf(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "quote transcript",
            "line_items": [{"description": "line item", "details": None, "price": None}],
            "total_amount": None,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    quote_id = create_response.json()["id"]

    response = await client.delete(f"/api/quotes/{quote_id}")

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_quote_bulk_action_requires_csrf(client: AsyncClient) -> None:
    await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/bulk-action",
        json={"action": "archive", "ids": ["00000000-0000-0000-0000-000000000000"]},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_duplicate_quote_requires_csrf(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    response = await client.post(f"/api/quotes/{quote['id']}/duplicate")

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_send_quote_email_requires_csrf(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token, email="customer@example.com")
    quote = await _create_quote(client, csrf_token, customer_id)

    response = await client.post(f"/api/quotes/{quote['id']}/send-email")

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_mark_won_quote_requires_csrf(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200

    response = await client.post(f"/api/quotes/{quote['id']}/mark-won")

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_mark_lost_quote_requires_csrf(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200

    response = await client.post(f"/api/quotes/{quote['id']}/mark-lost")

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


@pytest.mark.parametrize(
    ("method", "path_suffix", "payload"),
    [
        ("patch", "", {"due_date": "2026-05-01"}),
        ("post", "/pdf", None),
        ("post", "/share", None),
        ("post", "/send-email", None),
    ],
)
async def test_invoice_mutations_require_csrf(
    client: AsyncClient,
    db_session: AsyncSession,
    method: str,
    path_suffix: str,
    payload: dict[str, object] | None,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    invoice = await _create_approved_invoice(client, csrf_token, db_session)

    request_method = getattr(client, method)
    if payload is None:
        response = await request_method(f"/api/invoices/{invoice['id']}{path_suffix}")
    else:
        response = await request_method(
            f"/api/invoices/{invoice['id']}{path_suffix}",
            json=payload,
        )

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_create_invoice_requires_csrf(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    response = await client.post(
        "/api/invoices",
        json={
            "customer_id": customer_id,
            "transcript": "invoice transcript",
            "line_items": [{"description": "line item", "details": None, "price": 55}],
            "total_amount": 55,
            "notes": None,
            "source_type": "text",
        },
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_invoice_bulk_action_requires_csrf(client: AsyncClient) -> None:
    await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/invoices/bulk-action",
        json={"action": "archive", "ids": ["00000000-0000-0000-0000-000000000000"]},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}
