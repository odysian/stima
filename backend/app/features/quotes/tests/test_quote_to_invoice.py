"""Quote-to-invoice conversion API behavior tests."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.quotes.models import Document, QuoteStatus
from app.features.quotes.repository import QuoteRepository
from app.features.quotes.tests import test_quotes as quotes_test_module
from app.features.quotes.tests.support.helpers import (
    _create_customer,
    _create_quote,
    _credentials,
    _get_user_by_email,
    _register_and_login,
    _set_quote_status,
)

pytestmark = pytest.mark.asyncio

# Reuse existing fixture wiring/helpers from test_quotes to preserve behavior.
_reset_email_delivery_fallback_cache = quotes_test_module._reset_email_delivery_fallback_cache
_override_storage_service_dependency = quotes_test_module._override_storage_service_dependency
_override_quote_service_dependency = quotes_test_module._override_quote_service_dependency
_override_extraction_service_dependency = quotes_test_module._override_extraction_service_dependency
_reset_rate_limiter = quotes_test_module._reset_rate_limiter


@pytest.mark.parametrize(
    "starting_status",
    [
        QuoteStatus.DRAFT,
        QuoteStatus.READY,
        QuoteStatus.SHARED,
        QuoteStatus.VIEWED,
        QuoteStatus.APPROVED,
        QuoteStatus.DECLINED,
    ],
)
async def test_convert_quote_to_invoice_creates_linked_invoice_and_keeps_quote_list_clean(
    client: AsyncClient,
    db_session: AsyncSession,
    starting_status: QuoteStatus,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(
        client,
        csrf_token,
        email="customer@example.com",
        phone="+1-555-123-4567",
    )
    quote = await _create_quote(client, csrf_token, customer_id)
    quote_id = quote["id"]

    if starting_status in {
        QuoteStatus.SHARED,
        QuoteStatus.VIEWED,
        QuoteStatus.APPROVED,
        QuoteStatus.DECLINED,
    }:
        share_response = await client.post(
            f"/api/quotes/{quote_id}/share",
            headers={"X-CSRF-Token": csrf_token},
        )
        assert share_response.status_code == 200

    if starting_status is QuoteStatus.READY:
        await _set_quote_status(db_session, quote_id, QuoteStatus.READY)
    elif starting_status is not QuoteStatus.DRAFT and starting_status is not QuoteStatus.SHARED:
        await _set_quote_status(db_session, quote_id, starting_status)

    convert_response = await client.post(
        f"/api/quotes/{quote_id}/convert-to-invoice",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert convert_response.status_code == 201
    invoice_payload = convert_response.json()
    assert invoice_payload["doc_number"] == "I-001"
    assert invoice_payload["status"] == "draft"
    assert invoice_payload["source_document_id"] == quote_id
    assert invoice_payload["due_date"] is not None

    quote_detail_response = await client.get(f"/api/quotes/{quote_id}")
    assert quote_detail_response.status_code == 200
    quote_detail = quote_detail_response.json()
    assert quote_detail["linked_invoice"] == {
        "id": invoice_payload["id"],
        "doc_number": "I-001",
        "status": "draft",
        "due_date": invoice_payload["due_date"],
        "total_amount": 55.0,
        "created_at": invoice_payload["created_at"],
    }

    invoice_detail_response = await client.get(f"/api/invoices/{invoice_payload['id']}")
    assert invoice_detail_response.status_code == 200
    invoice_detail = invoice_detail_response.json()
    assert invoice_detail["source_quote_number"] == "Q-001"
    assert invoice_detail["customer"] == {
        "id": customer_id,
        "name": "Quote Test Customer",
        "email": "customer@example.com",
        "phone": "+1-555-123-4567",
    }

    list_response = await client.get("/api/quotes")
    assert list_response.status_code == 200
    list_payload = list_response.json()
    assert len(list_payload) == 1
    assert list_payload[0]["id"] == quote_id

    invoice_count = await db_session.scalar(
        select(func.count()).select_from(Document).where(Document.doc_type == "invoice")
    )
    assert invoice_count == 1


@pytest.mark.parametrize("starting_status", [QuoteStatus.DRAFT, QuoteStatus.READY])
async def test_patch_quote_doc_type_to_invoice_regenerates_number_and_sets_default_due_date(
    client: AsyncClient,
    db_session: AsyncSession,
    starting_status: QuoteStatus,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)
    quote_id = quote["id"]

    if starting_status is QuoteStatus.READY:
        await _set_quote_status(db_session, quote_id, QuoteStatus.READY)

    response = await client.patch(
        f"/api/quotes/{quote_id}",
        json={"doc_type": "invoice"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["doc_number"].startswith("I-")

    invoice_detail_response = await client.get(f"/api/invoices/{quote_id}")
    assert invoice_detail_response.status_code == 200
    invoice_detail = invoice_detail_response.json()
    assert invoice_detail["doc_number"].startswith("I-")
    assert invoice_detail["due_date"] == (datetime.now(UTC).date() + timedelta(days=30)).isoformat()


async def test_patch_quote_doc_type_to_invoice_accepts_explicit_due_date(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)
    quote_id = quote["id"]

    response = await client.patch(
        f"/api/quotes/{quote_id}",
        json={"doc_type": "invoice", "due_date": "2026-05-20"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    assert response.json()["doc_number"].startswith("I-")

    invoice_detail_response = await client.get(f"/api/invoices/{quote_id}")
    assert invoice_detail_response.status_code == 200
    assert invoice_detail_response.json()["due_date"] == "2026-05-20"


async def test_patch_quote_doc_type_after_share_returns_409(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200

    response = await client.patch(
        f"/api/quotes/{quote['id']}",
        json={"doc_type": "invoice"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "Document type cannot be changed after sharing."}


async def test_patch_quote_doc_type_to_invoice_rejects_non_changeable_status_without_share_token(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)
    quote_id = quote["id"]

    await _set_quote_status(db_session, quote_id, QuoteStatus.READY)
    await _set_quote_status(db_session, quote_id, QuoteStatus.APPROVED)

    response = await client.patch(
        f"/api/quotes/{quote_id}",
        json={"doc_type": "invoice"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Document type can only be changed in draft or ready status."
    }


async def test_patch_customerless_quote_doc_type_to_invoice_returns_409(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    credentials = _credentials()
    csrf_token = await _register_and_login(client, credentials)
    user = await _get_user_by_email(db_session, credentials["email"])
    repository = QuoteRepository(db_session)
    unassigned_quote = await repository.create(
        user_id=user.id,
        customer_id=None,
        title=None,
        transcript="unassigned quote",
        line_items=[],
        total_amount=None,
        tax_rate=None,
        discount_type=None,
        discount_value=None,
        deposit_amount=None,
        notes=None,
        source_type="text",
    )
    await repository.commit()

    response = await client.patch(
        f"/api/quotes/{unassigned_quote.id}",
        json={"doc_type": "invoice"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "Assign a customer before continuing."}


async def test_patch_quote_doc_type_to_invoice_rejects_existing_linked_invoice(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    convert_response = await client.post(
        f"/api/quotes/{quote['id']}/convert-to-invoice",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert convert_response.status_code == 201

    response = await client.patch(
        f"/api/quotes/{quote['id']}",
        json={"doc_type": "invoice"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "An invoice already exists for this quote"}


async def test_optional_pricing_persists_on_quotes_public_payloads_and_converted_invoices(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "title": "Priced quote",
            "transcript": "quote transcript",
            "line_items": [{"description": "line item", "details": None, "price": 120}],
            "total_amount": 120,
            "discount_type": "fixed",
            "discount_value": 10,
            "tax_rate": 0.1,
            "deposit_amount": 30,
            "notes": "Original note",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert create_response.status_code == 201
    quote_payload = create_response.json()
    assert quote_payload["total_amount"] == 121
    assert quote_payload["discount_type"] == "fixed"
    assert quote_payload["discount_value"] == 10
    assert quote_payload["tax_rate"] == 0.1
    assert quote_payload["deposit_amount"] == 30

    quote_id = quote_payload["id"]
    quote_detail_response = await client.get(f"/api/quotes/{quote_id}")
    assert quote_detail_response.status_code == 200
    assert quote_detail_response.json()["total_amount"] == 121

    share_response = await client.post(
        f"/api/quotes/{quote_id}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]
    assert share_token is not None

    public_response = await client.get(f"/api/public/doc/{share_token}")
    assert public_response.status_code == 200
    assert public_response.json()["discount_type"] == "fixed"
    assert public_response.json()["discount_value"] == 10
    assert public_response.json()["tax_rate"] == 0.1
    assert public_response.json()["deposit_amount"] == 30

    await _set_quote_status(db_session, quote_id, QuoteStatus.APPROVED)
    convert_response = await client.post(
        f"/api/quotes/{quote_id}/convert-to-invoice",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert convert_response.status_code == 201
    invoice_payload = convert_response.json()
    assert invoice_payload["total_amount"] == 121
    assert invoice_payload["discount_type"] == "fixed"
    assert invoice_payload["discount_value"] == 10
    assert invoice_payload["tax_rate"] == 0.1
    assert invoice_payload["deposit_amount"] == 30


@pytest.mark.parametrize(
    "starting_status",
    [
        QuoteStatus.DRAFT,
        QuoteStatus.READY,
        QuoteStatus.SHARED,
        QuoteStatus.VIEWED,
        QuoteStatus.APPROVED,
        QuoteStatus.DECLINED,
    ],
)
async def test_convert_quote_to_invoice_rejects_duplicates_and_patch_preserves_sent_invoice_status(
    client: AsyncClient,
    db_session: AsyncSession,
    starting_status: QuoteStatus,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)
    quote_id = quote["id"]

    if starting_status in {
        QuoteStatus.SHARED,
        QuoteStatus.VIEWED,
        QuoteStatus.APPROVED,
        QuoteStatus.DECLINED,
    }:
        share_response = await client.post(
            f"/api/quotes/{quote_id}/share",
            headers={"X-CSRF-Token": csrf_token},
        )
        assert share_response.status_code == 200

    if starting_status is QuoteStatus.READY:
        await _set_quote_status(db_session, quote_id, QuoteStatus.READY)
    elif starting_status is not QuoteStatus.DRAFT and starting_status is not QuoteStatus.SHARED:
        await _set_quote_status(db_session, quote_id, starting_status)

    first_convert = await client.post(
        f"/api/quotes/{quote_id}/convert-to-invoice",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert first_convert.status_code == 201
    invoice_id = first_convert.json()["id"]

    second_convert = await client.post(
        f"/api/quotes/{quote_id}/convert-to-invoice",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert second_convert.status_code == 409
    assert second_convert.json() == {"detail": "An invoice already exists for this quote"}

    share_response = await client.post(
        f"/api/invoices/{invoice_id}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    assert share_response.json()["status"] == "sent"
    original_share_token = share_response.json()["share_token"]

    patch_response = await client.patch(
        f"/api/invoices/{invoice_id}",
        json={
            "title": "Updated invoice",
            "line_items": [
                {
                    "description": "Final walkthrough",
                    "details": "Touch-up and cleanup",
                    "price": 90,
                }
            ],
            "total_amount": 90,
            "notes": "Updated after customer call",
            "due_date": "2026-05-01",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert patch_response.status_code == 200
    patched_invoice = patch_response.json()
    assert patched_invoice["status"] == "sent"
    assert patched_invoice["title"] == "Updated invoice"
    assert patched_invoice["total_amount"] == 90
    assert patched_invoice["notes"] == "Updated after customer call"
    assert patched_invoice["due_date"] == "2026-05-01"
    assert patched_invoice["share_token"] == original_share_token
    assert patched_invoice["line_items"] == [
        {
            "description": "Final walkthrough",
            "details": "Touch-up and cleanup",
            "id": patched_invoice["line_items"][0]["id"],
            "price": 90.0,
            "price_status": "priced",
            "flagged": False,
            "flag_reason": None,
            "sort_order": 0,
        }
    ]
