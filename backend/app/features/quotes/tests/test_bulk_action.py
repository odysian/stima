"""Quote bulk action API behavior tests."""

from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.quotes.models import QuoteStatus
from app.features.quotes.tests import test_quotes as quotes_test_module
from app.features.quotes.tests.support.helpers import (
    _create_customer,
    _create_direct_invoice,
    _create_quote,
    _credentials,
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


async def test_bulk_delete_quotes_returns_applied_and_blocked_for_linked_invoice(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    deletable_quote = await _create_quote(client, csrf_token, customer_id)
    linked_quote = await _create_quote(client, csrf_token, customer_id)
    await _set_quote_status(db_session, linked_quote["id"], QuoteStatus.APPROVED)

    convert_response = await client.post(
        f"/api/quotes/{linked_quote['id']}/convert-to-invoice",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert convert_response.status_code == 201
    invoice_payload = convert_response.json()
    await _set_quote_status(db_session, linked_quote["id"], QuoteStatus.READY)

    archive_response = await client.post(
        "/api/invoices/bulk-action",
        json={"action": "archive", "ids": [invoice_payload["id"]]},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert archive_response.status_code == 200

    response = await client.post(
        "/api/quotes/bulk-action",
        json={"action": "delete", "ids": [deletable_quote["id"], linked_quote["id"]]},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["action"] == "delete"
    assert payload["applied"] == [{"id": deletable_quote["id"]}]
    assert payload["blocked"] == [
        {
            "id": linked_quote["id"],
            "reason": "linked_invoice",
            "message": "Quotes with a linked invoice cannot be deleted.",
            "suggested_action": "archive",
        }
    ]


async def test_bulk_archive_quotes_deduplicates_ids_and_blocks_rearchive(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    first_response = await client.post(
        "/api/quotes/bulk-action",
        json={"action": "archive", "ids": [quote["id"], quote["id"]]},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert first_response.status_code == 200
    assert first_response.json() == {
        "action": "archive",
        "applied": [{"id": quote["id"]}],
        "blocked": [],
    }

    second_response = await client.post(
        "/api/quotes/bulk-action",
        json={"action": "archive", "ids": [quote["id"]]},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert second_response.status_code == 200
    assert second_response.json() == {
        "action": "archive",
        "applied": [],
        "blocked": [
            {
                "id": quote["id"],
                "reason": "already_archived",
                "message": "Quote is already archived.",
                "suggested_action": None,
            }
        ],
    }


async def test_bulk_delete_quotes_reports_not_found_status_and_doc_type_blocks(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    shared_quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{shared_quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200

    invoice = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id,
        title="Invoice",
        transcript="invoice",
        total_amount=10,
    )

    missing_id = str(uuid4())
    response = await client.post(
        "/api/quotes/bulk-action",
        json={"action": "delete", "ids": [shared_quote["id"], invoice["id"], missing_id]},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["applied"] == []
    assert payload["blocked"] == [
        {
            "id": shared_quote["id"],
            "reason": "quote_status_not_deletable",
            "message": "Shared, viewed, approved, and declined quotes cannot be deleted.",
            "suggested_action": None,
        },
        {
            "id": invoice["id"],
            "reason": "unsupported_document_type",
            "message": "Only quotes can be changed from this endpoint.",
            "suggested_action": None,
        },
        {
            "id": missing_id,
            "reason": "not_found",
            "message": "Document not found.",
            "suggested_action": None,
        },
    ]


@pytest.mark.parametrize(
    "payload",
    [
        {"action": "archive", "ids": []},
        {"action": "void", "ids": [str(uuid4())]},
        {"action": "delete", "ids": ["not-a-uuid"]},
    ],
)
async def test_bulk_quotes_request_validation_returns_422(
    client: AsyncClient,
    payload: dict[str, object],
) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/bulk-action",
        json=payload,
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422
