"""Invoice outcome API behavior tests."""

from __future__ import annotations

import json

import pytest
from app.features.quotes.models import QuoteStatus
from app.features.quotes.tests import test_quotes as quotes_test_module
from app.features.quotes.tests.support.helpers import (
    _create_customer,
    _create_direct_invoice,
    _credentials,
    _register_and_login,
    _set_invoice_status,
)
from app.shared import event_logger
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio

# Reuse existing fixture wiring/helpers from test_quotes to preserve behavior.
_reset_email_delivery_fallback_cache = quotes_test_module._reset_email_delivery_fallback_cache
_override_storage_service_dependency = quotes_test_module._override_storage_service_dependency
_override_quote_service_dependency = quotes_test_module._override_quote_service_dependency
_override_extraction_service_dependency = quotes_test_module._override_extraction_service_dependency
_reset_rate_limiter = quotes_test_module._reset_rate_limiter


@pytest.mark.parametrize(
    ("starting_status", "endpoint", "expected_status", "expected_event"),
    [
        (QuoteStatus.SENT, "mark-paid", "paid", "invoice_paid"),
        (QuoteStatus.VOID, "mark-paid", "paid", "invoice_paid"),
        (QuoteStatus.SENT, "mark-void", "void", "invoice_voided"),
        (QuoteStatus.PAID, "mark-void", "void", "invoice_voided"),
    ],
)
async def test_mark_invoice_outcome_transitions_status_and_emits_event_once(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    starting_status: QuoteStatus,
    endpoint: str,
    expected_status: str,
    expected_event: str,
) -> None:
    emitted_events: list[dict[str, str]] = []

    def _capture(message: str) -> None:
        emitted_events.append(json.loads(message))

    monkeypatch.setattr(event_logger._EVENT_LOGGER, "info", _capture)  # noqa: SLF001
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    invoice = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id,
        title="Invoice",
        transcript="invoice transcript",
        total_amount=120,
    )
    invoice_id = invoice["id"]

    share_response = await client.post(
        f"/api/invoices/{invoice_id}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    if starting_status is not QuoteStatus.SENT:
        await _set_invoice_status(db_session, invoice_id, starting_status)

    response = await client.post(
        f"/api/invoices/{invoice_id}/{endpoint}",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    assert response.json()["status"] == expected_status

    detail_response = await client.get(f"/api/invoices/{invoice_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["status"] == expected_status

    invoice_events = [
        payload["event"] for payload in emitted_events if payload.get("invoice_id") == invoice_id
    ]
    assert invoice_events[-1:] == [expected_event]


@pytest.mark.parametrize(
    ("starting_status", "endpoint", "expected_status", "expected_event"),
    [
        (QuoteStatus.PAID, "mark-paid", "paid", "invoice_paid"),
        (QuoteStatus.VOID, "mark-void", "void", "invoice_voided"),
    ],
)
async def test_mark_invoice_outcome_is_idempotent_without_duplicate_event(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    starting_status: QuoteStatus,
    endpoint: str,
    expected_status: str,
    expected_event: str,
) -> None:
    emitted_events: list[dict[str, str]] = []

    def _capture(message: str) -> None:
        emitted_events.append(json.loads(message))

    monkeypatch.setattr(event_logger._EVENT_LOGGER, "info", _capture)  # noqa: SLF001
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    invoice = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id,
        title="Invoice",
        transcript="invoice transcript",
        total_amount=120,
    )
    invoice_id = invoice["id"]

    share_response = await client.post(
        f"/api/invoices/{invoice_id}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    await _set_invoice_status(db_session, invoice_id, starting_status)

    response = await client.post(
        f"/api/invoices/{invoice_id}/{endpoint}",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    assert response.json()["status"] == expected_status

    matching_events = [
        payload
        for payload in emitted_events
        if payload.get("invoice_id") == invoice_id and payload.get("event") == expected_event
    ]
    assert matching_events == []


@pytest.mark.parametrize("starting_status", [QuoteStatus.DRAFT, QuoteStatus.READY])
@pytest.mark.parametrize("endpoint", ["mark-paid", "mark-void"])
async def test_mark_invoice_outcome_returns_409_for_draft_or_ready_invoices(
    client: AsyncClient,
    db_session: AsyncSession,
    starting_status: QuoteStatus,
    endpoint: str,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    invoice = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id,
        title="Invoice",
        transcript="invoice transcript",
        total_amount=120,
    )
    invoice_id = invoice["id"]

    if starting_status is QuoteStatus.READY:
        await _set_invoice_status(db_session, invoice_id, QuoteStatus.READY)

    response = await client.post(
        f"/api/invoices/{invoice_id}/{endpoint}",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 409


@pytest.mark.parametrize(
    ("endpoint", "expected_status"),
    [("mark-paid", "paid"), ("mark-void", "void")],
)
async def test_invoice_outcome_labels_remain_editable_shareable_and_public(
    client: AsyncClient,
    endpoint: str,
    expected_status: str,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    invoice = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id,
        title="Invoice",
        transcript="invoice transcript",
        total_amount=120,
    )
    invoice_id = invoice["id"]

    share_response = await client.post(
        f"/api/invoices/{invoice_id}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    original_share_token = share_response.json()["share_token"]

    outcome_response = await client.post(
        f"/api/invoices/{invoice_id}/{endpoint}",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert outcome_response.status_code == 200
    assert outcome_response.json()["status"] == expected_status

    patch_response = await client.patch(
        f"/api/invoices/{invoice_id}",
        json={"notes": "Updated after outcome"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert patch_response.status_code == 200
    assert patch_response.json()["status"] == expected_status
    assert patch_response.json()["notes"] == "Updated after outcome"

    reshare_response = await client.post(
        f"/api/invoices/{invoice_id}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert reshare_response.status_code == 200
    assert reshare_response.json()["status"] == expected_status
    assert reshare_response.json()["share_token"] == original_share_token

    public_response = await client.get(f"/api/public/doc/{original_share_token}")
    assert public_response.status_code == 200
    assert public_response.json()["doc_type"] == "invoice"


async def test_invoice_share_emits_invoice_shared_event_with_id_only_payload(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    emitted_events: list[dict[str, str]] = []

    def _capture(message: str) -> None:
        emitted_events.append(json.loads(message))

    monkeypatch.setattr(event_logger._EVENT_LOGGER, "info", _capture)  # noqa: SLF001
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    invoice = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id,
        title="Invoice",
        transcript="invoice transcript",
        total_amount=120,
    )

    response = await client.post(
        f"/api/invoices/{invoice['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    matching_events = [
        payload
        for payload in emitted_events
        if payload.get("event") == "invoice_shared" and payload.get("invoice_id") == invoice["id"]
    ]
    assert len(matching_events) == 1
    assert matching_events[0]["customer_id"] == customer_id
    assert "share_token" not in matching_events[0]
