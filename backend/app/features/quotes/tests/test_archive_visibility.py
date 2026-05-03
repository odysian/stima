"""Quote archive visibility behavior tests."""

from __future__ import annotations

from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.invoices.repository import InvoiceRepository
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


async def test_archived_quote_hidden_from_default_lists_and_public_share_still_works(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token, name="Archive Customer")
    quote = await _create_quote(client, csrf_token, customer_id)
    await _set_quote_status(db_session, quote["id"], QuoteStatus.SHARED)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]
    assert isinstance(share_token, str)

    persisted_quote = await db_session.get(Document, UUID(quote["id"]))
    assert persisted_quote is not None
    original_status = persisted_quote.status

    repository = QuoteRepository(db_session)
    archived = await repository.archive_by_id(
        quote_id=persisted_quote.id,
        user_id=persisted_quote.user_id,
    )
    assert archived
    await repository.commit()

    await db_session.refresh(persisted_quote)
    assert persisted_quote.archived_at is not None
    assert persisted_quote.status == original_status

    list_response = await client.get("/api/quotes")
    assert list_response.status_code == 200
    assert list_response.json() == []

    archived_list_response = await client.get("/api/quotes?archived=true")
    assert archived_list_response.status_code == 200
    assert [item["id"] for item in archived_list_response.json()] == [quote["id"]]

    customer_list_response = await client.get(f"/api/quotes?customer_id={customer_id}")
    assert customer_list_response.status_code == 200
    assert customer_list_response.json() == []

    archived_customer_list_response = await client.get(
        f"/api/quotes?archived=true&customer_id={customer_id}"
    )
    assert archived_customer_list_response.status_code == 200
    assert [item["id"] for item in archived_customer_list_response.json()] == [quote["id"]]

    reuse_response = await client.get("/api/quotes/reuse-candidates")
    assert reuse_response.status_code == 200
    assert reuse_response.json() == []

    detail_response = await client.get(f"/api/quotes/{quote['id']}")
    assert detail_response.status_code == 200

    public_response = await client.get(f"/api/public/doc/{share_token}")
    assert public_response.status_code == 200


async def test_archive_quote_rejects_other_user_and_rearchive(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    owner_credentials = _credentials()
    owner_csrf = await _register_and_login(client, owner_credentials)
    customer_id = await _create_customer(client, owner_csrf)
    quote = await _create_quote(client, owner_csrf, customer_id)

    persisted_quote = await db_session.get(Document, UUID(quote["id"]))
    assert persisted_quote is not None
    original_status = persisted_quote.status

    other_credentials = _credentials()
    await _register_and_login(client, other_credentials)
    other_user = await _get_user_by_email(db_session, other_credentials["email"])

    repository = QuoteRepository(db_session)
    archived_by_other_user = await repository.archive_by_id(
        quote_id=persisted_quote.id,
        user_id=other_user.id,
    )
    assert archived_by_other_user is False

    archived_by_owner = await repository.archive_by_id(
        quote_id=persisted_quote.id,
        user_id=persisted_quote.user_id,
    )
    assert archived_by_owner
    await repository.commit()

    archived_again = await repository.archive_by_id(
        quote_id=persisted_quote.id,
        user_id=persisted_quote.user_id,
    )
    assert archived_again is False

    await db_session.refresh(persisted_quote)
    assert persisted_quote.archived_at is not None
    assert persisted_quote.status == original_status


async def test_archived_quote_list_filters_by_customer_when_archived_true(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token, name="Archived Customer")
    other_customer_id = await _create_customer(client, csrf_token, name="Active Customer")
    archived_quote = await _create_quote(client, csrf_token, customer_id)
    await _create_quote(client, csrf_token, other_customer_id)

    repository = QuoteRepository(db_session)
    persisted_quote = await db_session.get(Document, UUID(archived_quote["id"]))
    assert persisted_quote is not None
    archived = await repository.archive_by_id(
        quote_id=persisted_quote.id,
        user_id=persisted_quote.user_id,
    )
    assert archived
    await repository.commit()

    archived_response = await client.get("/api/quotes?archived=true")
    assert archived_response.status_code == 200
    assert [item["id"] for item in archived_response.json()] == [archived_quote["id"]]

    archived_customer_response = await client.get(
        f"/api/quotes?archived=true&customer_id={customer_id}"
    )
    assert archived_customer_response.status_code == 200
    assert [item["id"] for item in archived_customer_response.json()] == [archived_quote["id"]]

    archived_other_customer_response = await client.get(
        f"/api/quotes?archived=true&customer_id={other_customer_id}"
    )
    assert archived_other_customer_response.status_code == 200
    assert archived_other_customer_response.json() == []


async def test_has_linked_invoice_still_true_after_linked_invoice_archived(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)
    await _set_quote_status(db_session, quote["id"], QuoteStatus.APPROVED)

    convert_response = await client.post(
        f"/api/quotes/{quote['id']}/convert-to-invoice",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert convert_response.status_code == 201
    invoice_id = convert_response.json()["id"]

    persisted_quote = await db_session.get(Document, UUID(quote["id"]))
    persisted_invoice = await db_session.get(Document, UUID(invoice_id))
    assert persisted_quote is not None
    assert persisted_invoice is not None

    invoice_repository = InvoiceRepository(db_session)
    archived_invoice = await invoice_repository.archive_by_id(
        invoice_id=persisted_invoice.id,
        user_id=persisted_invoice.user_id,
    )
    assert archived_invoice
    await invoice_repository.commit()

    quote_repository = QuoteRepository(db_session)
    has_linked_invoice = await quote_repository.has_linked_invoice(
        source_document_id=persisted_quote.id,
        user_id=persisted_quote.user_id,
    )
    assert has_linked_invoice
