"""Invoice bulk action API behavior tests."""

from __future__ import annotations

from uuid import uuid4

import pytest
from app.features.quotes.tests import test_quotes as quotes_test_module
from app.features.quotes.tests.support.helpers import (
    _create_customer,
    _create_direct_invoice,
    _create_quote,
    _credentials,
    _register_and_login,
)
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio

# Reuse existing fixture wiring/helpers from test_quotes to preserve behavior.
_reset_email_delivery_fallback_cache = quotes_test_module._reset_email_delivery_fallback_cache
_override_storage_service_dependency = quotes_test_module._override_storage_service_dependency
_override_quote_service_dependency = quotes_test_module._override_quote_service_dependency
_override_extraction_service_dependency = quotes_test_module._override_extraction_service_dependency
_reset_rate_limiter = quotes_test_module._reset_rate_limiter


async def test_bulk_archive_invoices_deduplicates_ids_and_blocks_rearchive(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    invoice = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id,
        title="Archive me",
        transcript="invoice transcript",
        total_amount=100,
    )

    first_response = await client.post(
        "/api/invoices/bulk-action",
        json={"action": "archive", "ids": [invoice["id"], invoice["id"]]},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert first_response.status_code == 200
    assert first_response.json() == {
        "action": "archive",
        "applied": [{"id": invoice["id"]}],
        "blocked": [],
    }

    second_response = await client.post(
        "/api/invoices/bulk-action",
        json={"action": "archive", "ids": [invoice["id"]]},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert second_response.status_code == 200
    assert second_response.json() == {
        "action": "archive",
        "applied": [],
        "blocked": [
            {
                "id": invoice["id"],
                "reason": "already_archived",
                "message": "Invoice is already archived.",
            }
        ],
    }


async def test_bulk_unarchive_invoices_applies_owned_archived_and_blocks_others(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    archived_invoice = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id,
        title="Archived invoice",
        transcript="invoice transcript",
        total_amount=100,
    )
    active_invoice = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id,
        title="Active invoice",
        transcript="invoice transcript",
        total_amount=120,
    )

    archive_response = await client.post(
        "/api/invoices/bulk-action",
        json={"action": "archive", "ids": [archived_invoice["id"]]},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert archive_response.status_code == 200

    missing_id = str(uuid4())
    unarchive_response = await client.post(
        "/api/invoices/bulk-action",
        json={
            "action": "unarchive",
            "ids": [archived_invoice["id"], active_invoice["id"], missing_id],
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert unarchive_response.status_code == 200
    assert unarchive_response.json() == {
        "action": "unarchive",
        "applied": [{"id": archived_invoice["id"]}],
        "blocked": [
            {
                "id": active_invoice["id"],
                "reason": "not_archived",
                "message": "Invoice is not archived.",
            },
            {
                "id": missing_id,
                "reason": "not_found",
                "message": "Document not found.",
            },
        ],
    }


async def test_bulk_delete_invoices_reports_blocked_per_document(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    invoice = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id,
        title="Delete blocked",
        transcript="invoice transcript",
        total_amount=50,
    )
    quote = await _create_quote(client, csrf_token, customer_id)
    missing_id = str(uuid4())

    response = await client.post(
        "/api/invoices/bulk-action",
        json={"action": "delete", "ids": [invoice["id"], quote["id"], missing_id]},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    assert response.json() == {
        "action": "delete",
        "applied": [],
        "blocked": [
            {
                "id": invoice["id"],
                "reason": "invoice_delete_not_supported",
                "message": "Invoices cannot be deleted in this version.",
            },
            {
                "id": quote["id"],
                "reason": "unsupported_document_type",
                "message": "Only invoices can be changed from this endpoint.",
            },
            {
                "id": missing_id,
                "reason": "not_found",
                "message": "Document not found.",
            },
        ],
    }


@pytest.mark.parametrize(
    "payload",
    [
        {"action": "archive", "ids": []},
        {"action": "void", "ids": [str(uuid4())]},
        {"action": "delete", "ids": ["not-a-uuid"]},
    ],
)
async def test_bulk_invoices_request_validation_returns_422(
    client: AsyncClient,
    payload: dict[str, object],
) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/invoices/bulk-action",
        json=payload,
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422
