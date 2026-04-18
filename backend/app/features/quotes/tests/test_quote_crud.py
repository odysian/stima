"""Quote CRUD API behavior tests."""

from __future__ import annotations

import json
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.quotes.models import Document, LineItem, QuoteStatus
from app.features.quotes.repository import QuoteRepository
from app.features.quotes.schemas import LineItemDraft
from app.features.quotes.tests import test_quotes as quotes_test_module
from app.features.quotes.tests.support.helpers import (
    _create_customer,
    _create_quote,
    _credentials,
    _get_user_by_email,
    _register_and_login,
    _run_pdf_job,
    _send_email_headers,
    _set_quote_status,
)
from app.features.quotes.tests.support.mocks import _MockArqPool
from app.main import app
from app.shared import event_logger
from app.shared.input_limits import (
    CUSTOMER_ADDRESS_MAX_CHARS,
    DOCUMENT_LINE_ITEMS_MAX_ITEMS,
    DOCUMENT_NOTES_MAX_CHARS,
    DOCUMENT_TRANSCRIPT_MAX_CHARS,
    LINE_ITEM_DESCRIPTION_MAX_CHARS,
    LINE_ITEM_DETAILS_MAX_CHARS,
)

pytestmark = pytest.mark.asyncio

# Reuse existing fixture wiring/helpers from test_quotes to preserve behavior.
_reset_email_delivery_fallback_cache = quotes_test_module._reset_email_delivery_fallback_cache
_override_storage_service_dependency = quotes_test_module._override_storage_service_dependency
_override_quote_service_dependency = quotes_test_module._override_quote_service_dependency
_override_extraction_service_dependency = quotes_test_module._override_extraction_service_dependency
_reset_rate_limiter = quotes_test_module._reset_rate_limiter


async def test_quote_crud_happy_path_with_ordering_and_line_item_replacement(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(
        client,
        csrf_token,
        name="Quote Test Customer",
        email="customer@example.com",
        phone="+1-555-123-4567",
    )

    initial_list = await client.get("/api/quotes")
    assert initial_list.status_code == 200
    assert initial_list.json() == []

    extraction_response = await client.post(
        "/api/quotes/convert-notes",
        json={"notes": "5 yards brown mulch and edge front beds, total 120"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert extraction_response.status_code == 200
    extraction_payload = extraction_response.json()
    assert extraction_payload["transcript"]
    assert isinstance(extraction_payload["line_items"], list)
    assert extraction_payload["line_items"][0]["price"] == 120

    create_response_1 = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "title": "  Front Bed Refresh  ",
            "transcript": extraction_payload["transcript"],
            "line_items": extraction_payload["line_items"],
            "total_amount": extraction_payload["pricing_hints"]["explicit_total"],
            "notes": "Please review within 7 days",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response_1.status_code == 201
    created_quote_1 = create_response_1.json()
    assert created_quote_1["doc_number"] == "Q-001"
    assert created_quote_1["title"] == "Front Bed Refresh"
    assert created_quote_1["status"] == "draft"
    assert created_quote_1["source_type"] == "text"

    create_response_2 = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "Second quote",
            "line_items": [
                {
                    "description": "Refresh garden bed",
                    "details": None,
                    "price": 75,
                }
            ],
            "total_amount": 75,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response_2.status_code == 201
    created_quote_2 = create_response_2.json()
    assert created_quote_2["doc_number"] == "Q-002"
    assert created_quote_2["title"] is None

    list_response = await client.get("/api/quotes")
    assert list_response.status_code == 200
    list_payload = list_response.json()
    assert len(list_payload) == 2
    assert list_payload[0]["id"] == created_quote_2["id"]
    assert list_payload[1]["id"] == created_quote_1["id"]
    assert list_payload[0]["customer_name"] == "Quote Test Customer"
    assert list_payload[1]["customer_name"] == "Quote Test Customer"
    assert list_payload[0]["item_count"] == 1
    assert list_payload[1]["item_count"] == 1
    assert list_payload[0]["requires_customer_assignment"] is False
    assert list_payload[1]["requires_customer_assignment"] is False
    assert list_payload[0]["can_reassign_customer"] is True
    assert list_payload[1]["can_reassign_customer"] is True
    assert set(list_payload[0].keys()) == {
        "id",
        "customer_id",
        "customer_name",
        "doc_type",
        "doc_number",
        "title",
        "status",
        "total_amount",
        "item_count",
        "requires_customer_assignment",
        "can_reassign_customer",
        "created_at",
    }
    # Regression guard: list endpoint remains lightweight and does not leak detail payloads.
    assert "transcript" not in list_payload[0]
    assert "notes" not in list_payload[0]
    assert "line_items" not in list_payload[0]
    assert "share_token" not in list_payload[0]
    assert "updated_at" not in list_payload[0]
    assert list_payload[0]["title"] is None
    assert list_payload[1]["title"] == "Front Bed Refresh"

    detail_response = await client.get(f"/api/quotes/{created_quote_1['id']}")
    assert detail_response.status_code == 200
    detail_payload = detail_response.json()
    assert detail_payload["id"] == created_quote_1["id"]
    assert detail_payload["customer_name"] == "Quote Test Customer"
    assert detail_payload["customer_email"] == "customer@example.com"
    assert detail_payload["customer_phone"] == "+1-555-123-4567"
    assert detail_payload["title"] == "Front Bed Refresh"
    assert detail_payload["requires_customer_assignment"] is False
    assert detail_payload["can_reassign_customer"] is True
    assert detail_payload["linked_invoice"] is None
    assert detail_payload["line_items"]

    patch_response = await client.patch(
        f"/api/quotes/{created_quote_1['id']}",
        json={
            "title": "   ",
            "line_items": [
                {
                    "description": "Premium brown mulch",
                    "details": "6 yards",
                    "price": None,
                }
            ],
            "total_amount": 150,
            "notes": "Updated note",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert patch_response.status_code == 200
    patched = patch_response.json()
    assert len(patched["line_items"]) == 1
    assert patched["line_items"][0]["description"] == "Premium brown mulch"
    assert patched["line_items"][0]["price"] is None
    assert patched["title"] is None
    assert patched["total_amount"] == 150
    assert patched["notes"] == "Updated note"


async def test_quote_detail_omits_price_status_in_line_item_payloads(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "Initial quote",
            "line_items": [
                {"description": "Brown mulch", "details": None, "price": 120},
                {
                    "description": "Cleanup labor",
                    "details": "Included / no charge",
                    "price": None,
                },
                {
                    "description": "Optional edging",
                    "details": "Need to confirm price onsite",
                    "price": None,
                },
            ],
            "total_amount": 120,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    payload = create_response.json()
    assert all("price_status" not in item for item in payload["line_items"])

    detail_response = await client.get(f"/api/quotes/{payload['id']}")
    assert detail_response.status_code == 200
    detail_payload = detail_response.json()
    assert all("price_status" not in item for item in detail_payload["line_items"])


async def test_quote_detail_blank_prices_remain_readable_without_price_status(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "Legacy normalization test",
            "line_items": [
                {"description": "Brown mulch", "details": None, "price": 120},
                {"description": "Cleanup labor", "details": "Included / no charge", "price": None},
                {"description": "Optional edging", "details": "Need estimate", "price": None},
            ],
            "total_amount": 120,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    quote_id = UUID(create_response.json()["id"])
    detail_response = await client.get(f"/api/quotes/{quote_id}")
    assert detail_response.status_code == 200
    detail_payload = detail_response.json()
    assert all("price_status" not in item for item in detail_payload["line_items"])
    assert detail_payload["line_items"][0]["price"] == 120
    assert detail_payload["line_items"][1]["price"] is None
    assert detail_payload["line_items"][2]["price"] is None


async def test_create_quote_uses_priced_and_blank_rows_as_subtotal_authority(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "Mulch and cleanup included",
            "line_items": [
                {
                    "description": "Mulch",
                    "details": "5 yards",
                    "price": 120,
                },
                {
                    "description": "Cleanup",
                    "details": "Included / no charge",
                    "price": None,
                },
            ],
            "total_amount": None,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["total_amount"] == 120


async def test_create_quote_with_blank_price_rows_ignores_blanks_for_total(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "Mulch and edging TBD",
            "line_items": [
                {
                    "description": "Mulch",
                    "details": "5 yards",
                    "price": 120,
                },
                {
                    "description": "Edging",
                    "details": "Need to confirm price onsite",
                    "price": None,
                },
            ],
            "total_amount": None,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["total_amount"] == 120


async def test_get_quote_returns_404_for_nonexistent_id(client: AsyncClient) -> None:
    await _register_and_login(client, _credentials())

    response = await client.get(f"/api/quotes/{uuid4()}")

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


async def test_update_quote_returns_404_for_nonexistent_id(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.patch(
        f"/api/quotes/{uuid4()}",
        json={"notes": "updated"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


async def test_create_quote_returns_404_for_nonexistent_customer(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes",
        json={
            "customer_id": str(uuid4()),
            "transcript": "quote transcript",
            "line_items": [{"description": "line item", "details": None, "price": 55}],
            "total_amount": 55,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


async def test_create_manual_draft_without_customer_persists_empty_draft_and_logs_manual_event(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    emitted_events: list[dict[str, str]] = []

    def _capture(message: str) -> None:
        emitted_events.append(json.loads(message))

    monkeypatch.setattr(event_logger._EVENT_LOGGER, "info", _capture)  # noqa: SLF001

    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/manual-draft",
        json={},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["customer_id"] is None
    assert payload["title"] is None
    assert payload["status"] == "draft"
    assert payload["source_type"] == "text"
    assert payload["transcript"] == ""
    assert payload["line_items"] == []
    assert payload["total_amount"] is None

    persisted_quote = await db_session.get(Document, UUID(payload["id"]))
    assert persisted_quote is not None
    assert persisted_quote.extraction_review_metadata is None

    detail_response = await client.get(f"/api/quotes/{payload['id']}")
    assert detail_response.status_code == 200
    detail_payload = detail_response.json()
    assert detail_payload["extraction_tier"] is None
    assert detail_payload["extraction_degraded_reason_code"] is None
    assert detail_payload["extraction_review_metadata"]["review_state"] == {
        "notes_pending": False,
        "pricing_pending": False,
    }
    assert detail_payload["extraction_review_metadata"]["hidden_details"] == {
        "items": [],
    }

    quote_event_names = [
        event["event"] for event in emitted_events if event.get("quote_id") == payload["id"]
    ]
    assert "manual_draft_created" in quote_event_names
    assert "draft_generated" not in quote_event_names


async def test_create_manual_draft_with_owned_customer_assigns_customer(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    response = await client.post(
        "/api/quotes/manual-draft",
        json={"customer_id": customer_id},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["customer_id"] == customer_id
    assert payload["line_items"] == []
    assert payload["transcript"] == ""


async def test_create_manual_draft_rejects_missing_or_foreign_customer(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    first_user_customer_id = await _create_customer(client, csrf_token)

    missing_customer_response = await client.post(
        "/api/quotes/manual-draft",
        json={"customer_id": str(uuid4())},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert missing_customer_response.status_code == 404
    assert missing_customer_response.json() == {"detail": "Not found"}

    second_user_credentials = _credentials()
    second_user_credentials["email"] = "manual-draft-second-user@example.com"
    second_user_csrf_token = await _register_and_login(
        client,
        second_user_credentials,
    )
    foreign_customer_response = await client.post(
        "/api/quotes/manual-draft",
        json={"customer_id": first_user_customer_id},
        headers={"X-CSRF-Token": second_user_csrf_token},
    )
    assert foreign_customer_response.status_code == 404
    assert foreign_customer_response.json() == {"detail": "Not found"}


async def test_create_quote_allows_empty_line_items_and_returns_empty_list(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "quote transcript",
            "line_items": [],
            "total_amount": None,
            "notes": "No line items yet",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["line_items"] == []

    list_response = await client.get("/api/quotes")
    assert list_response.status_code == 200
    assert list_response.json()[0]["item_count"] == 0


async def test_create_quote_emits_quote_created_business_event(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    emitted_events: list[dict[str, str]] = []

    def _capture(message: str) -> None:
        emitted_events.append(json.loads(message))

    monkeypatch.setattr(event_logger._EVENT_LOGGER, "info", _capture)  # noqa: SLF001

    credentials = _credentials()
    csrf_token = await _register_and_login(client, credentials)
    customer_id = await _create_customer(client, csrf_token)

    response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "quote transcript",
            "line_items": [{"description": "line item", "details": None, "price": 55}],
            "total_amount": 55,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 201
    payload = response.json()
    user = await _get_user_by_email(db_session, credentials["email"])

    quote_created_events = [
        event
        for event in emitted_events
        if event.get("event") == "quote.created" and event.get("quote_id") == payload["id"]
    ]
    assert len(quote_created_events) == 1

    quote_created_event = quote_created_events[0]
    assert quote_created_event["quote_id"] == payload["id"]
    assert quote_created_event["customer_id"] == customer_id
    assert quote_created_event["user_id"] == str(user.id)


async def test_update_quote_preserves_line_items_when_omitted(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "quote transcript",
            "line_items": [
                {"description": "Mulch", "details": "5 yards", "price": 120},
                {"description": "Edging", "details": None, "price": 80},
            ],
            "total_amount": 200,
            "notes": "Initial note",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    quote_id = create_response.json()["id"]

    response = await client.patch(
        f"/api/quotes/{quote_id}",
        json={"notes": "Updated note only"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert [item["description"] for item in payload["line_items"]] == [
        "Mulch",
        "Edging",
    ]
    assert [item["price"] for item in payload["line_items"]] == [120, 80]
    assert payload["notes"] == "Updated note only"
    assert payload["total_amount"] == 200


async def test_update_quote_replaces_line_items_when_provided(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "quote transcript",
            "line_items": [
                {"description": "Mulch", "details": "5 yards", "price": 120},
                {"description": "Edging", "details": None, "price": 80},
            ],
            "total_amount": 200,
            "notes": "Initial note",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    quote_id = create_response.json()["id"]

    response = await client.patch(
        f"/api/quotes/{quote_id}",
        json={
            "line_items": [
                {
                    "description": "Premium mulch refresh",
                    "details": "6 yards",
                    "price": 180,
                }
            ]
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["line_items"] == [
        {
            "id": payload["line_items"][0]["id"],
            "description": "Premium mulch refresh",
            "details": "6 yards",
            "price": 180.0,
            "flagged": False,
            "flag_reason": None,
            "sort_order": 0,
        }
    ]
    assert payload["total_amount"] == 180


async def test_update_quote_recomputes_priced_total_when_line_items_change_without_subtotal_patch(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "quote transcript",
            "line_items": [
                {"description": "Mulch", "details": "5 yards", "price": 100},
            ],
            "total_amount": 100,
            "discount_type": "fixed",
            "discount_value": 10,
            "tax_rate": 0.1,
            "notes": "Initial note",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    quote_id = create_response.json()["id"]

    response = await client.patch(
        f"/api/quotes/{quote_id}",
        json={
            "line_items": [
                {
                    "description": "Premium mulch refresh",
                    "details": "6 yards",
                    "price": 200,
                }
            ]
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_amount"] == 209
    assert payload["discount_type"] == "fixed"
    assert payload["discount_value"] == 10
    assert payload["tax_rate"] == 0.1


async def test_quote_patch_deposit_only_preserves_total_and_stores_deposit(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "quote transcript",
            "line_items": [{"description": "Work", "details": None, "price": 100}],
            "total_amount": 100,
            "discount_type": "fixed",
            "discount_value": 10,
            "tax_rate": 0.1,
            "notes": "Initial note",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    quote_id = create_response.json()["id"]
    expected_total = create_response.json()["total_amount"]
    assert expected_total == 99

    patch_response = await client.patch(
        f"/api/quotes/{quote_id}",
        json={"deposit_amount": 25},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert patch_response.status_code == 200
    patched = patch_response.json()
    assert patched["total_amount"] == expected_total
    assert patched["deposit_amount"] == 25

    detail_response = await client.get(f"/api/quotes/{quote_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["total_amount"] == expected_total
    assert detail_response.json()["deposit_amount"] == 25


async def test_quote_patch_deposit_exceeds_total_returns_422_without_partial_write(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "quote transcript",
            "line_items": [{"description": "Work", "details": None, "price": 100}],
            "total_amount": 100,
            "discount_type": "fixed",
            "discount_value": 10,
            "tax_rate": 0.1,
            "notes": "Initial note",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    quote_id = create_response.json()["id"]
    expected_total = create_response.json()["total_amount"]

    patch_response = await client.patch(
        f"/api/quotes/{quote_id}",
        json={"deposit_amount": float(expected_total) + 1},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert patch_response.status_code == 422
    assert patch_response.json() == {"detail": "Deposit cannot exceed the total amount"}

    detail_response = await client.get(f"/api/quotes/{quote_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["deposit_amount"] is None
    assert detail_response.json()["total_amount"] == expected_total


async def test_quote_patch_discount_value_null_clears_discount_and_recomputes_total(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "quote transcript",
            "line_items": [{"description": "Work", "details": None, "price": 100}],
            "total_amount": 100,
            "discount_type": "fixed",
            "discount_value": 20,
            "tax_rate": 0.1,
            "notes": "Initial note",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    quote_id = create_response.json()["id"]
    assert create_response.json()["total_amount"] == 88

    patch_response = await client.patch(
        f"/api/quotes/{quote_id}",
        json={"discount_value": None},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert patch_response.status_code == 200
    patched = patch_response.json()
    assert patched["discount_type"] is None
    assert patched["discount_value"] is None
    assert patched["tax_rate"] == 0.1
    assert patched["total_amount"] == 110


async def test_quote_patch_tax_rate_only_recomputes_total_from_reverse_subtotal(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "quote transcript",
            "line_items": [{"description": "Work", "details": None, "price": 100}],
            "total_amount": 100,
            "tax_rate": 0.1,
            "notes": "Initial note",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    quote_id = create_response.json()["id"]
    assert create_response.json()["total_amount"] == 110

    patch_response = await client.patch(
        f"/api/quotes/{quote_id}",
        json={"tax_rate": 0.2},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert patch_response.status_code == 200
    patched = patch_response.json()
    assert patched["tax_rate"] == 0.2
    assert patched["total_amount"] == 120


async def test_business_events_are_logged_for_quote_customer_and_extraction_flows(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    emitted_events: list[dict[str, str]] = []

    def _capture(message: str) -> None:
        emitted_events.append(json.loads(message))

    monkeypatch.setattr(event_logger._EVENT_LOGGER, "info", _capture)  # noqa: SLF001

    csrf_token = await _register_and_login(client, _credentials())

    customer_response = await client.post(
        "/api/customers",
        json={"name": "Event Test Customer", "email": "customer@example.com"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert customer_response.status_code == 201
    customer_payload = customer_response.json()

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_payload["id"],
            "transcript": "Spring cleanup quote",
            "line_items": [{"description": "Cleanup", "details": None, "price": 200}],
            "total_amount": 200,
            "notes": "Initial draft",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    quote_payload = create_response.json()

    extract_response = await client.post(
        "/api/quotes/extract",
        data={"notes": "Refresh beds and edge walkway"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert extract_response.status_code == 200

    update_response = await client.patch(
        f"/api/quotes/{quote_payload['id']}",
        json={"notes": "Revised draft"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert update_response.status_code == 200

    original_pool = getattr(app.state, "arq_pool", None)
    app.state.arq_pool = _MockArqPool()
    try:
        pdf_response = await client.post(
            f"/api/quotes/{quote_payload['id']}/pdf",
            headers={"X-CSRF-Token": csrf_token},
        )
        assert pdf_response.status_code == 202
        await _run_pdf_job(db_session, job_id=pdf_response.json()["id"])
    finally:
        app.state.arq_pool = original_pool

    share_response = await client.post(
        f"/api/quotes/{quote_payload['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200

    delete_create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_payload["id"],
            "transcript": "Delete me",
            "line_items": [{"description": "Mulch", "details": None, "price": 80}],
            "total_amount": 80,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert delete_create_response.status_code == 201
    delete_quote_payload = delete_create_response.json()

    delete_response = await client.delete(
        f"/api/quotes/{delete_quote_payload['id']}",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert delete_response.status_code == 204

    event_names = [payload["event"] for payload in emitted_events]
    assert event_names == [
        "customer.created",
        "quote.created",
        "quote_started",
        "quote.created",
        "draft_generated",
        "quote.updated",
        "quote_pdf_generated",
        "quote_shared",
        "quote.created",
        "quote.deleted",
    ]
    assert emitted_events[0]["customer_id"] == customer_payload["id"]
    assert emitted_events[1]["quote_id"] == quote_payload["id"]
    assert emitted_events[2]["detail"] == "notes"
    assert emitted_events[3]["quote_id"] != quote_payload["id"]
    assert emitted_events[4]["detail"] == "notes"
    assert emitted_events[4]["extraction_outcome"] == "primary"
    assert emitted_events[6]["quote_id"] == quote_payload["id"]
    assert emitted_events[8]["quote_id"] == delete_quote_payload["id"]
    assert all(
        "Event Test Customer" not in payload_text
        for payload_text in map(json.dumps, emitted_events)
    )
    assert all(
        "customer@example.com" not in payload_text
        for payload_text in map(json.dumps, emitted_events)
    )


@pytest.mark.parametrize(
    ("payload_overrides", "expected_field"),
    [
        ({"transcript": "x" * (DOCUMENT_TRANSCRIPT_MAX_CHARS + 1)}, "transcript"),
        ({"notes": "x" * (DOCUMENT_NOTES_MAX_CHARS + 1)}, "notes"),
        (
            {
                "line_items": [
                    {"description": "line item", "details": None, "price": 1}
                    for _ in range(DOCUMENT_LINE_ITEMS_MAX_ITEMS + 1)
                ]
            },
            "line_items",
        ),
        (
            {
                "line_items": [
                    {
                        "description": "x" * (LINE_ITEM_DESCRIPTION_MAX_CHARS + 1),
                        "details": None,
                        "price": 55,
                    }
                ]
            },
            "description",
        ),
        (
            {
                "line_items": [
                    {
                        "description": "line item",
                        "details": "x" * (LINE_ITEM_DETAILS_MAX_CHARS + 1),
                        "price": 55,
                    }
                ]
            },
            "details",
        ),
    ],
)
async def test_create_quote_rejects_payloads_over_document_ceilings(
    client: AsyncClient,
    payload_overrides: dict[str, object],
    expected_field: str,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    payload: dict[str, object] = {
        "customer_id": customer_id,
        "transcript": "quote transcript",
        "line_items": [{"description": "line item", "details": None, "price": 55}],
        "total_amount": 55,
        "notes": "Original note",
        "source_type": "text",
    }
    payload.update(payload_overrides)

    response = await client.post(
        "/api/quotes",
        json=payload,
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422
    assert expected_field in json.dumps(response.json()["detail"])


async def test_update_quote_rejects_notes_over_limit(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    response = await client.patch(
        f"/api/quotes/{quote['id']}",
        json={"notes": "x" * (DOCUMENT_NOTES_MAX_CHARS + 1)},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422


async def test_create_customer_rejects_address_over_limit(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/customers",
        json={
            "name": "Quote Test Customer",
            "address": "x" * (CUSTOMER_ADDRESS_MAX_CHARS + 1),
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422


async def test_get_quote_detail_includes_nullable_customer_contact_fields(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(
        client,
        csrf_token,
        name="Nullable Contact Customer",
        email=None,
        phone=None,
    )

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "Quote with nullable customer contact fields",
            "line_items": [{"description": "Line item", "details": None, "price": 55}],
            "total_amount": 55,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    quote_id = create_response.json()["id"]

    detail_response = await client.get(f"/api/quotes/{quote_id}")
    assert detail_response.status_code == 200
    detail_payload = detail_response.json()
    assert detail_payload["customer_name"] == "Nullable Contact Customer"
    assert detail_payload["customer_email"] is None
    assert detail_payload["customer_phone"] is None
    assert detail_payload["linked_invoice"] is None


async def test_quotes_support_unassigned_drafts_and_customer_assignment_guards(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    credentials = _credentials()
    csrf_token = await _register_and_login(client, credentials)
    assigned_customer_id = await _create_customer(
        client,
        csrf_token,
        name="Assigned Customer",
        email="assigned@example.com",
        phone="+1-555-000-1111",
    )
    target_customer_id = await _create_customer(
        client,
        csrf_token,
        name="Target Customer",
        email="target@example.com",
        phone="+1-555-000-2222",
    )
    replacement_customer_id = await _create_customer(
        client,
        csrf_token,
        name="Replacement Customer",
        email="replacement@example.com",
        phone="+1-555-000-3333",
    )
    assigned_quote = await _create_quote(client, csrf_token, assigned_customer_id)

    user = await _get_user_by_email(db_session, credentials["email"])
    repository = QuoteRepository(db_session)
    unassigned_quote = await repository.create(
        user_id=user.id,
        customer_id=None,
        title="Awaiting assignment",
        transcript="unassigned quote transcript",
        line_items=[
            LineItemDraft(
                description="Cleanup",
                details="Front beds",
                price=55,
            )
        ],
        total_amount=55,
        tax_rate=None,
        discount_type=None,
        discount_value=None,
        deposit_amount=None,
        notes=None,
        source_type="text",
    )
    await repository.commit()

    list_response = await client.get("/api/quotes")
    assert list_response.status_code == 200
    list_payload = list_response.json()
    assert {quote["id"] for quote in list_payload} == {
        assigned_quote["id"],
        str(unassigned_quote.id),
    }
    unassigned_list_item = next(
        quote for quote in list_payload if quote["id"] == str(unassigned_quote.id)
    )
    assert unassigned_list_item["customer_id"] is None
    assert unassigned_list_item["customer_name"] is None
    assert unassigned_list_item["requires_customer_assignment"] is True
    assert unassigned_list_item["can_reassign_customer"] is True

    detail_response = await client.get(f"/api/quotes/{unassigned_quote.id}")
    assert detail_response.status_code == 200
    detail_payload = detail_response.json()
    assert detail_payload["customer_id"] is None
    assert detail_payload["customer_name"] is None
    assert detail_payload["customer_email"] is None
    assert detail_payload["customer_phone"] is None
    assert detail_payload["requires_customer_assignment"] is True
    assert detail_payload["can_reassign_customer"] is True

    pdf_response = await client.post(
        f"/api/quotes/{unassigned_quote.id}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert pdf_response.status_code == 409
    assert pdf_response.json() == {"detail": "Assign a customer before continuing."}

    share_response = await client.post(
        f"/api/quotes/{unassigned_quote.id}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 409
    assert share_response.json() == {"detail": "Assign a customer before continuing."}

    send_email_response = await client.post(
        f"/api/quotes/{unassigned_quote.id}/send-email",
        headers=_send_email_headers(
            csrf_token,
            idempotency_key="unassigned-quote-send-email",
        ),
    )
    assert send_email_response.status_code == 409
    assert send_email_response.json() == {"detail": "Assign a customer before continuing."}

    convert_response = await client.post(
        f"/api/quotes/{unassigned_quote.id}/convert-to-invoice",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert convert_response.status_code == 409
    assert convert_response.json() == {"detail": "Assign a customer before continuing."}

    assign_response = await client.patch(
        f"/api/quotes/{unassigned_quote.id}",
        json={
            "customer_id": target_customer_id,
            "transcript": "assigned quote transcript",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert assign_response.status_code == 200
    assigned_payload = assign_response.json()
    assert assigned_payload["customer_id"] == target_customer_id
    assert assigned_payload["transcript"] == "assigned quote transcript"

    assigned_detail_response = await client.get(f"/api/quotes/{unassigned_quote.id}")
    assert assigned_detail_response.status_code == 200
    assigned_detail_payload = assigned_detail_response.json()
    assert assigned_detail_payload["customer_id"] == target_customer_id
    assert assigned_detail_payload["customer_name"] == "Target Customer"
    assert assigned_detail_payload["customer_email"] == "target@example.com"
    assert assigned_detail_payload["customer_phone"] == "+1-555-000-2222"
    assert assigned_detail_payload["requires_customer_assignment"] is False
    assert assigned_detail_payload["can_reassign_customer"] is True

    assigned_pdf_response = await client.post(
        f"/api/quotes/{unassigned_quote.id}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert assigned_pdf_response.status_code == 503
    assert assigned_pdf_response.json() == {
        "detail": "Unable to start PDF generation right now. Please try again."
    }

    clear_response = await client.patch(
        f"/api/quotes/{unassigned_quote.id}",
        json={"customer_id": None},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert clear_response.status_code == 409
    assert clear_response.json() == {"detail": "Customer cannot be cleared from a quote."}

    shared_response = await client.post(
        f"/api/quotes/{unassigned_quote.id}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert shared_response.status_code == 200
    assert shared_response.json()["status"] == "shared"

    blocked_reassignment_response = await client.patch(
        f"/api/quotes/{unassigned_quote.id}",
        json={"customer_id": replacement_customer_id},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert blocked_reassignment_response.status_code == 409
    assert blocked_reassignment_response.json() == {
        "detail": "Customer cannot be changed after sharing or invoice conversion."
    }


async def test_list_quotes_can_filter_by_customer_id(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id_a = await _create_customer(client, csrf_token, name="Customer A")
    customer_id_b = await _create_customer(client, csrf_token, name="Customer B")

    create_response_a = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id_a,
            "transcript": "Quote for customer A",
            "line_items": [{"description": "Mulch", "details": None, "price": 120}],
            "total_amount": 120,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response_a.status_code == 201

    create_response_b = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id_b,
            "transcript": "Quote for customer B",
            "line_items": [{"description": "Stone", "details": None, "price": 220}],
            "total_amount": 220,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response_b.status_code == 201
    quote_b = create_response_b.json()

    response = await client.get(f"/api/quotes?customer_id={customer_id_b}")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": quote_b["id"],
            "customer_id": customer_id_b,
            "customer_name": "Customer B",
            "doc_type": "quote",
            "doc_number": "Q-002",
            "title": None,
            "status": "draft",
            "total_amount": 220,
            "item_count": 1,
            "requires_customer_assignment": False,
            "can_reassign_customer": True,
            "created_at": quote_b["created_at"],
        }
    ]


async def test_list_quotes_returns_empty_when_customer_filter_has_no_matches(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    existing_customer_id = await _create_customer(client, csrf_token, name="Customer A")
    missing_customer_id = await _create_customer(client, csrf_token, name="Customer B")

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": existing_customer_id,
            "transcript": "Quote for customer A",
            "line_items": [{"description": "Mulch", "details": None, "price": 120}],
            "total_amount": 120,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201

    response = await client.get(f"/api/quotes?customer_id={missing_customer_id}")

    assert response.status_code == 200
    assert response.json() == []


async def test_event_log_persistence_failure_does_not_fail_quote_operations(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _boom(**_: object) -> None:
        raise RuntimeError("db sink unavailable")

    monkeypatch.setattr(event_logger, "_persist_event_record", _boom)
    event_logger.configure_event_logging(session_factory=object())  # type: ignore[arg-type]

    csrf_token = await _register_and_login(client, _credentials())
    response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "mulch the side yard"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    await event_logger.flush_event_tasks()


async def test_create_quote_returns_404_for_different_users_customer(
    client: AsyncClient,
) -> None:
    csrf_token_user_a = await _register_and_login(client, _credentials())
    customer_id_user_a = await _create_customer(client, csrf_token_user_a)

    csrf_token_user_b = await _register_and_login(client, _credentials())
    response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id_user_a,
            "transcript": "quote transcript",
            "line_items": [{"description": "line item", "details": None, "price": 55}],
            "total_amount": 55,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token_user_b},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


async def test_get_quote_returns_404_for_different_users_quote(
    client: AsyncClient,
) -> None:
    csrf_token_user_a = await _register_and_login(client, _credentials())
    customer_id_user_a = await _create_customer(client, csrf_token_user_a)

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id_user_a,
            "transcript": "quote transcript",
            "line_items": [{"description": "line item", "details": None, "price": 55}],
            "total_amount": 55,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token_user_a},
    )
    assert create_response.status_code == 201
    quote_id = create_response.json()["id"]

    await _register_and_login(client, _credentials())
    response = await client.get(f"/api/quotes/{quote_id}")

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


async def test_patch_quote_returns_404_for_different_users_quote(
    client: AsyncClient,
) -> None:
    csrf_token_user_a = await _register_and_login(client, _credentials())
    customer_id_user_a = await _create_customer(client, csrf_token_user_a)

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id_user_a,
            "transcript": "quote transcript",
            "line_items": [{"description": "line item", "details": None, "price": 55}],
            "total_amount": 55,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token_user_a},
    )
    assert create_response.status_code == 201
    quote_id = create_response.json()["id"]

    csrf_token_user_b = await _register_and_login(client, _credentials())
    response = await client.patch(
        f"/api/quotes/{quote_id}",
        json={"notes": "hijacked"},
        headers={"X-CSRF-Token": csrf_token_user_b},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


@pytest.mark.parametrize("make_ready", [False, True], ids=["draft", "ready"])
async def test_delete_quote_returns_204_for_owned_draft_and_ready_quotes_and_cascades(
    client: AsyncClient,
    db_session: AsyncSession,
    make_ready: bool,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "quote transcript",
            "line_items": [
                {"description": "Mulch", "details": "5 yards", "price": 120},
                {"description": "Edging", "details": None, "price": 80},
            ],
            "total_amount": 200,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    quote_id = create_response.json()["id"]

    initial_line_item_count = await db_session.scalar(
        select(func.count(LineItem.id)).where(LineItem.document_id == UUID(quote_id))
    )
    assert int(initial_line_item_count or 0) == 2

    if make_ready:
        await _set_quote_status(db_session, quote_id, QuoteStatus.READY)

    delete_response = await client.delete(
        f"/api/quotes/{quote_id}",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert delete_response.status_code == 204
    assert delete_response.content == b""

    detail_after_delete = await client.get(f"/api/quotes/{quote_id}")
    assert detail_after_delete.status_code == 404
    assert detail_after_delete.json() == {"detail": "Not found"}

    list_response = await client.get("/api/quotes")
    assert list_response.status_code == 200
    assert list_response.json() == []

    remaining_line_item_count = await db_session.scalar(
        select(func.count(LineItem.id)).where(LineItem.document_id == UUID(quote_id))
    )
    assert int(remaining_line_item_count or 0) == 0


async def test_delete_quote_returns_404_for_missing_quote(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.delete(
        "/api/quotes/00000000-0000-0000-0000-000000000000",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


async def test_delete_quote_returns_404_for_different_users_quote(
    client: AsyncClient,
) -> None:
    csrf_token_user_a = await _register_and_login(client, _credentials())
    customer_id_user_a = await _create_customer(client, csrf_token_user_a)

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id_user_a,
            "transcript": "quote transcript",
            "line_items": [{"description": "line item", "details": None, "price": 55}],
            "total_amount": 55,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token_user_a},
    )
    assert create_response.status_code == 201
    quote_id = create_response.json()["id"]

    csrf_token_user_b = await _register_and_login(client, _credentials())
    response = await client.delete(
        f"/api/quotes/{quote_id}",
        headers={"X-CSRF-Token": csrf_token_user_b},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


async def test_patch_ready_quote_preserves_ready_status_even_when_values_do_not_change(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "quote transcript",
            "line_items": [{"description": "line item", "details": None, "price": 55}],
            "total_amount": 55,
            "notes": "Original note",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    quote_id = create_response.json()["id"]

    await _set_quote_status(db_session, quote_id, QuoteStatus.READY)

    patch_response = await client.patch(
        f"/api/quotes/{quote_id}",
        json={"notes": "Original note"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert patch_response.status_code == 200
    assert patch_response.json()["status"] == "ready"
    assert patch_response.json()["notes"] == "Original note"


async def test_patch_shared_quote_preserves_shared_status_and_share_fields(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "quote transcript",
            "line_items": [{"description": "line item", "details": None, "price": 55}],
            "total_amount": 55,
            "notes": "Original note",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    quote_id = create_response.json()["id"]

    share_response = await client.post(
        f"/api/quotes/{quote_id}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    assert share_response.json()["status"] == "shared"
    original_payload = share_response.json()

    patch_response = await client.patch(
        f"/api/quotes/{quote_id}",
        json={"notes": "Updated note"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert patch_response.status_code == 200
    assert patch_response.json()["status"] == "shared"
    assert patch_response.json()["notes"] == "Updated note"
    assert patch_response.json()["share_token"] == original_payload["share_token"]
    assert patch_response.json()["shared_at"] == original_payload["shared_at"]


async def test_delete_shared_quote_returns_409(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "quote transcript",
            "line_items": [{"description": "line item", "details": None, "price": 55}],
            "total_amount": 55,
            "notes": "Original note",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    quote_id = create_response.json()["id"]

    share_response = await client.post(
        f"/api/quotes/{quote_id}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    assert share_response.json()["status"] == "shared"

    delete_response = await client.delete(
        f"/api/quotes/{quote_id}",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert delete_response.status_code == 409
    assert delete_response.json() == {"detail": "Shared quotes cannot be deleted"}


@pytest.mark.parametrize(
    "status",
    [QuoteStatus.VIEWED, QuoteStatus.APPROVED, QuoteStatus.DECLINED],
)
async def test_delete_non_editable_quote_statuses_return_409(
    client: AsyncClient,
    db_session: AsyncSession,
    status: QuoteStatus,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)
    quote_id = quote["id"]

    share_response = await client.post(
        f"/api/quotes/{quote_id}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    await _set_quote_status(db_session, quote_id, status)

    delete_response = await client.delete(
        f"/api/quotes/{quote_id}",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert delete_response.status_code == 409
    assert delete_response.json() == {"detail": "Shared quotes cannot be deleted"}


async def test_create_quote_persists_voice_source_type(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "transcript from stitched-1",
            "line_items": [{"description": "Line item", "details": None, "price": 35}],
            "total_amount": 35,
            "notes": None,
            "source_type": "voice",
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 201
    assert response.json()["source_type"] == "voice"


@pytest.mark.parametrize(
    ("pricing_payload", "expected_detail"),
    [
        (
            {
                "discount_type": "fixed",
                "discount_value": None,
            },
            "Discount type and value must be provided together",
        ),
        (
            {
                "discount_value": 0,
            },
            "Discount type and value must be provided together",
        ),
        (
            {
                "discount_type": "fixed",
                "discount_value": 150,
            },
            "Discount cannot exceed the subtotal",
        ),
        (
            {
                "tax_rate": 1.5,
            },
            "Tax rate must be between 0 and 1",
        ),
        (
            {
                "deposit_amount": -10,
            },
            "Deposit amount cannot be negative",
        ),
        (
            {
                "deposit_amount": 130,
            },
            "Deposit cannot exceed the total amount",
        ),
    ],
)
async def test_create_quote_rejects_invalid_optional_pricing_without_persisting_document(
    client: AsyncClient,
    db_session: AsyncSession,
    pricing_payload: dict[str, object],
    expected_detail: str,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    initial_count = await db_session.scalar(select(func.count()).select_from(Document))

    response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "quote transcript",
            "line_items": [{"description": "line item", "details": None, "price": 120}],
            "total_amount": 120,
            "notes": "Original note",
            "source_type": "text",
            **pricing_payload,
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": expected_detail}

    final_count = await db_session.scalar(select(func.count()).select_from(Document))
    assert final_count == initial_count
