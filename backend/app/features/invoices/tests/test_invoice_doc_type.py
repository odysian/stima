"""Invoice doc-type conversion API behavior tests."""

from __future__ import annotations

from uuid import UUID

import pytest
from app.features.quotes.models import Document, QuoteStatus
from app.features.quotes.tests import test_quotes as quotes_test_module
from app.features.quotes.tests.support.helpers import (
    _create_customer,
    _create_direct_invoice,
    _create_quote,
    _credentials,
    _register_and_login,
    _set_invoice_status,
)
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio

# Reuse existing fixture wiring/helpers from test_quotes to preserve behavior.
_reset_email_delivery_fallback_cache = quotes_test_module._reset_email_delivery_fallback_cache
_override_storage_service_dependency = quotes_test_module._override_storage_service_dependency
_override_quote_service_dependency = quotes_test_module._override_quote_service_dependency
_override_extraction_service_dependency = quotes_test_module._override_extraction_service_dependency
_reset_rate_limiter = quotes_test_module._reset_rate_limiter


@pytest.mark.parametrize("starting_status", [QuoteStatus.DRAFT, QuoteStatus.READY])
async def test_patch_invoice_doc_type_to_quote_regenerates_number_and_clears_due_date(
    client: AsyncClient,
    db_session: AsyncSession,
    starting_status: QuoteStatus,
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

    if starting_status is QuoteStatus.READY:
        await _set_invoice_status(db_session, invoice_id, QuoteStatus.READY)

    response = await client.patch(
        f"/api/invoices/{invoice_id}",
        json={"doc_type": "quote"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["doc_number"].startswith("Q-")

    stored_document = await db_session.scalar(
        select(Document).where(Document.id == UUID(invoice_id))
    )
    assert stored_document is not None
    assert stored_document.doc_type == "quote"
    assert stored_document.due_date is None


async def test_patch_invoice_doc_type_after_share_returns_409(
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
        total_amount=220,
    )
    invoice_id = direct_invoice["id"]

    share_response = await client.post(
        f"/api/invoices/{invoice_id}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200

    response = await client.patch(
        f"/api/invoices/{invoice_id}",
        json={"doc_type": "quote"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "Document type cannot be changed after sharing."}


async def test_patch_invoice_doc_type_to_quote_rejects_non_changeable_status_without_share_token(
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
    await _set_invoice_status(db_session, invoice_id, QuoteStatus.SENT)

    response = await client.patch(
        f"/api/invoices/{invoice_id}",
        json={"doc_type": "quote"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Document type can only be changed in draft or ready status."
    }


async def test_patch_invoice_doc_type_to_quote_rejects_linked_source_invoice(
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
    invoice_id = convert_response.json()["id"]

    response = await client.patch(
        f"/api/invoices/{invoice_id}",
        json={"doc_type": "quote"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Invoices created from quotes cannot be converted to quotes."
    }
