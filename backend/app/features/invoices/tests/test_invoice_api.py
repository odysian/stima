"""Invoice API behavior tests."""

from __future__ import annotations

import pytest
from app.features.quotes.models import Document, QuoteStatus
from app.features.quotes.tests import test_quotes as quotes_test_module
from app.features.quotes.tests.support.helpers import (
    _create_approved_invoice,
    _create_customer,
    _create_direct_invoice,
    _create_quote,
    _credentials,
    _register_and_login,
    _set_invoice_status,
    _set_quote_status,
)
from app.shared.input_limits import (
    DOCUMENT_TRANSCRIPT_MAX_CHARS,
)
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio

# Reuse existing fixture wiring/helpers from test_quotes to preserve behavior.
_reset_email_delivery_fallback_cache = quotes_test_module._reset_email_delivery_fallback_cache
_override_storage_service_dependency = quotes_test_module._override_storage_service_dependency
_override_quote_service_dependency = quotes_test_module._override_quote_service_dependency
_override_extraction_service_dependency = quotes_test_module._override_extraction_service_dependency
_reset_rate_limiter = quotes_test_module._reset_rate_limiter


async def test_create_direct_invoice_rejects_transcript_over_limit(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    response = await client.post(
        "/api/invoices",
        json={
            "customer_id": customer_id,
            "transcript": "x" * (DOCUMENT_TRANSCRIPT_MAX_CHARS + 1),
            "line_items": [{"description": "line item", "details": None, "price": 55}],
            "total_amount": 55,
            "notes": "Original note",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422


async def test_create_invoice_returns_404_for_different_users_customer(
    client: AsyncClient,
) -> None:
    csrf_token_user_a = await _register_and_login(client, _credentials())
    customer_id_user_a = await _create_customer(client, csrf_token_user_a)

    csrf_token_user_b = await _register_and_login(client, _credentials())
    response = await client.post(
        "/api/invoices",
        json={
            "customer_id": customer_id_user_a,
            "transcript": "invoice transcript",
            "line_items": [{"description": "line item", "details": None, "price": 55}],
            "total_amount": 55,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token_user_b},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


async def test_create_direct_invoice_sets_default_due_date_and_keeps_quote_list_clean(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(
        client,
        csrf_token,
        email="customer@example.com",
        phone="+1-555-123-4567",
    )

    create_response = await client.post(
        "/api/invoices",
        json={
            "customer_id": customer_id,
            "title": "  Front Bed Refresh  ",
            "transcript": "invoice transcript",
            "line_items": [{"description": "line item", "details": None, "price": 55}],
            "total_amount": 55,
            "notes": "Original note",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert create_response.status_code == 201
    invoice_payload = create_response.json()
    assert invoice_payload["doc_number"] == "I-001"
    assert invoice_payload["status"] == "draft"
    assert invoice_payload["title"] == "Front Bed Refresh"
    assert invoice_payload["source_document_id"] is None
    assert invoice_payload["due_date"] is not None

    invoice_detail_response = await client.get(f"/api/invoices/{invoice_payload['id']}")
    assert invoice_detail_response.status_code == 200
    invoice_detail = invoice_detail_response.json()
    assert invoice_detail["source_document_id"] is None
    assert invoice_detail["source_quote_number"] is None
    assert invoice_detail["customer"] == {
        "id": customer_id,
        "name": "Quote Test Customer",
        "email": "customer@example.com",
        "phone": "+1-555-123-4567",
    }

    list_response = await client.get("/api/quotes")
    assert list_response.status_code == 200
    assert list_response.json() == []

    quote_count = await db_session.scalar(
        select(func.count()).select_from(Document).where(Document.doc_type == "quote")
    )
    invoice_count = await db_session.scalar(
        select(func.count()).select_from(Document).where(Document.doc_type == "invoice")
    )
    assert quote_count == 0
    assert invoice_count == 1


async def test_list_invoices_returns_direct_and_quote_derived_summaries_newest_first(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    quote_customer_id = await _create_customer(client, csrf_token, name="Quote Customer")
    direct_customer_id = await _create_customer(client, csrf_token, name="Direct Customer")

    quote = await _create_quote(client, csrf_token, quote_customer_id)
    await _set_quote_status(db_session, quote["id"], QuoteStatus.APPROVED)
    linked_invoice_response = await client.post(
        f"/api/quotes/{quote['id']}/convert-to-invoice",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert linked_invoice_response.status_code == 201
    linked_invoice = linked_invoice_response.json()

    direct_invoice = await _create_direct_invoice(
        client,
        csrf_token,
        direct_customer_id,
        title="Direct invoice",
        transcript="direct invoice transcript",
        total_amount=220,
    )

    response = await client.get("/api/invoices")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": direct_invoice["id"],
            "customer_id": direct_customer_id,
            "customer_name": "Direct Customer",
            "doc_type": "invoice",
            "doc_number": "I-002",
            "title": "Direct invoice",
            "status": "draft",
            "total_amount": 220,
            "due_date": direct_invoice["due_date"],
            "created_at": direct_invoice["created_at"],
            "source_document_id": None,
        },
        {
            "id": linked_invoice["id"],
            "customer_id": quote_customer_id,
            "customer_name": "Quote Customer",
            "doc_type": "invoice",
            "doc_number": "I-001",
            "title": None,
            "status": "draft",
            "total_amount": 55,
            "due_date": linked_invoice["due_date"],
            "created_at": linked_invoice["created_at"],
            "source_document_id": quote["id"],
        },
    ]


async def test_list_invoices_can_filter_by_customer_id(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id_a = await _create_customer(client, csrf_token, name="Customer A")
    customer_id_b = await _create_customer(client, csrf_token, name="Customer B")

    await _create_direct_invoice(
        client,
        csrf_token,
        customer_id_a,
        title="Invoice for A",
        transcript="invoice for customer a",
        total_amount=120,
    )
    invoice_b = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id_b,
        title="Invoice for B",
        transcript="invoice for customer b",
        total_amount=220,
    )

    response = await client.get(f"/api/invoices?customer_id={customer_id_b}")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": invoice_b["id"],
            "customer_id": customer_id_b,
            "customer_name": "Customer B",
            "doc_type": "invoice",
            "doc_number": "I-002",
            "title": "Invoice for B",
            "status": "draft",
            "total_amount": 220,
            "due_date": invoice_b["due_date"],
            "created_at": invoice_b["created_at"],
            "source_document_id": None,
        }
    ]


async def test_invoice_patch_preserves_omitted_fields_and_ready_status_for_direct_invoice(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    direct_invoice = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id,
        title="Direct invoice",
        transcript="direct invoice transcript",
        total_amount=220,
    )
    invoice_id = direct_invoice["id"]
    assert isinstance(invoice_id, str)

    await _set_invoice_status(db_session, invoice_id, QuoteStatus.READY)

    patch_response = await client.patch(
        f"/api/invoices/{invoice_id}",
        json={"notes": "Updated note only"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert patch_response.status_code == 200
    patched_invoice = patch_response.json()
    assert patched_invoice["status"] == "ready"
    assert patched_invoice["title"] == "Direct invoice"
    assert patched_invoice["notes"] == "Updated note only"
    assert patched_invoice["due_date"] == direct_invoice["due_date"]
    assert patched_invoice["total_amount"] == 220
    assert patched_invoice["line_items"] == direct_invoice["line_items"]
    assert patched_invoice["share_token"] is None
    assert patched_invoice["shared_at"] is None


async def test_invoice_patch_rejects_invalid_optional_pricing_without_partial_write(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    direct_invoice = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id,
        title="Direct invoice",
        transcript="direct invoice transcript",
        total_amount=120,
    )
    invoice_id = direct_invoice["id"]

    patch_response = await client.patch(
        f"/api/invoices/{invoice_id}",
        json={"tax_rate": 1.25},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert patch_response.status_code == 422
    assert patch_response.json() == {"detail": "Tax rate must be between 0 and 1"}

    invoice_detail_response = await client.get(f"/api/invoices/{invoice_id}")
    assert invoice_detail_response.status_code == 200
    assert invoice_detail_response.json()["tax_rate"] is None
    assert invoice_detail_response.json()["discount_type"] is None


async def test_invoice_patch_recomputes_priced_total_when_line_items_change_without_subtotal_patch(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/invoices",
        json={
            "customer_id": customer_id,
            "title": "Direct invoice",
            "transcript": "direct invoice transcript",
            "line_items": [{"description": "line item", "details": None, "price": 100}],
            "total_amount": 100,
            "discount_type": "fixed",
            "discount_value": 10,
            "tax_rate": 0.1,
            "notes": "Original note",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    invoice_id = create_response.json()["id"]

    patch_response = await client.patch(
        f"/api/invoices/{invoice_id}",
        json={
            "line_items": [
                {"description": "updated line item", "details": None, "price": 200},
            ]
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert patch_response.status_code == 200
    patched_invoice = patch_response.json()
    assert patched_invoice["total_amount"] == 209
    assert patched_invoice["discount_type"] == "fixed"
    assert patched_invoice["discount_value"] == 10
    assert patched_invoice["tax_rate"] == 0.1

    invoice_detail_response = await client.get(f"/api/invoices/{invoice_id}")
    assert invoice_detail_response.status_code == 200
    assert invoice_detail_response.json()["deposit_amount"] is None
    assert invoice_detail_response.json()["total_amount"] == 209


async def test_invoice_patch_deposit_only_preserves_total_and_stores_deposit(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/invoices",
        json={
            "customer_id": customer_id,
            "title": "Direct invoice",
            "transcript": "direct invoice transcript",
            "line_items": [{"description": "Work", "details": None, "price": 100}],
            "total_amount": 100,
            "discount_type": "fixed",
            "discount_value": 10,
            "tax_rate": 0.1,
            "notes": "Original note",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    invoice_id = create_response.json()["id"]
    expected_total = create_response.json()["total_amount"]
    assert expected_total == 99

    patch_response = await client.patch(
        f"/api/invoices/{invoice_id}",
        json={"deposit_amount": 25},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert patch_response.status_code == 200
    patched = patch_response.json()
    assert patched["total_amount"] == expected_total
    assert patched["deposit_amount"] == 25

    detail_response = await client.get(f"/api/invoices/{invoice_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["total_amount"] == expected_total
    assert detail_response.json()["deposit_amount"] == 25


async def test_invoice_patch_deposit_exceeds_total_returns_422_without_partial_write(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/invoices",
        json={
            "customer_id": customer_id,
            "title": "Direct invoice",
            "transcript": "direct invoice transcript",
            "line_items": [{"description": "Work", "details": None, "price": 100}],
            "total_amount": 100,
            "discount_type": "fixed",
            "discount_value": 10,
            "tax_rate": 0.1,
            "notes": "Original note",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    invoice_id = create_response.json()["id"]
    expected_total = create_response.json()["total_amount"]

    patch_response = await client.patch(
        f"/api/invoices/{invoice_id}",
        json={"deposit_amount": float(expected_total) + 1},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert patch_response.status_code == 422
    assert patch_response.json() == {"detail": "Deposit cannot exceed the total amount"}

    detail_response = await client.get(f"/api/invoices/{invoice_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["deposit_amount"] is None
    assert detail_response.json()["total_amount"] == expected_total


async def test_invoice_patch_discount_value_null_clears_discount_and_recomputes_total(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/invoices",
        json={
            "customer_id": customer_id,
            "title": "Direct invoice",
            "transcript": "direct invoice transcript",
            "line_items": [{"description": "Work", "details": None, "price": 100}],
            "total_amount": 100,
            "discount_type": "fixed",
            "discount_value": 20,
            "tax_rate": 0.1,
            "notes": "Original note",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    invoice_id = create_response.json()["id"]
    assert create_response.json()["total_amount"] == 88

    patch_response = await client.patch(
        f"/api/invoices/{invoice_id}",
        json={"discount_value": None},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert patch_response.status_code == 200
    patched = patch_response.json()
    assert patched["discount_type"] is None
    assert patched["discount_value"] is None
    assert patched["tax_rate"] == 0.1
    assert patched["total_amount"] == 110


async def test_invoice_patch_tax_rate_only_recomputes_total_from_reverse_subtotal(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/invoices",
        json={
            "customer_id": customer_id,
            "title": "Direct invoice",
            "transcript": "direct invoice transcript",
            "line_items": [{"description": "Work", "details": None, "price": 100}],
            "total_amount": 100,
            "tax_rate": 0.1,
            "notes": "Original note",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    invoice_id = create_response.json()["id"]
    assert create_response.json()["total_amount"] == 110

    patch_response = await client.patch(
        f"/api/invoices/{invoice_id}",
        json={"tax_rate": 0.2},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert patch_response.status_code == 200
    patched = patch_response.json()
    assert patched["tax_rate"] == 0.2
    assert patched["total_amount"] == 120


@pytest.mark.parametrize(
    ("method", "path_suffix", "payload"),
    [
        ("get", "", None),
        ("patch", "", {"due_date": "2026-05-01"}),
        ("post", "/pdf", None),
        ("post", "/share", None),
    ],
)
async def test_invoice_endpoints_return_404_for_different_users_invoice(
    client: AsyncClient,
    db_session: AsyncSession,
    method: str,
    path_suffix: str,
    payload: dict[str, object] | None,
) -> None:
    owner_csrf_token = await _register_and_login(client, _credentials())
    invoice = await _create_approved_invoice(client, owner_csrf_token, db_session)

    other_user_csrf_token = await _register_and_login(client, _credentials())
    request_method = getattr(client, method)
    headers = {"X-CSRF-Token": other_user_csrf_token} if method != "get" else None

    if payload is None:
        response = await request_method(
            f"/api/invoices/{invoice['id']}{path_suffix}",
            headers=headers,
        )
    else:
        response = await request_method(
            f"/api/invoices/{invoice['id']}{path_suffix}",
            json=payload,
            headers=headers,
        )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}
