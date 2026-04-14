"""Quote outcome API behavior tests."""

from __future__ import annotations

import json
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.quotes.models import Document, QuoteStatus
from app.features.quotes.repository import QuoteRepository
from app.features.quotes.tests import test_quotes as quotes_test_module
from app.shared import event_logger

pytestmark = pytest.mark.asyncio

# Reuse existing fixture wiring/helpers from test_quotes to preserve behavior.
_reset_email_delivery_fallback_cache = quotes_test_module._reset_email_delivery_fallback_cache
_override_storage_service_dependency = quotes_test_module._override_storage_service_dependency
_override_quote_service_dependency = quotes_test_module._override_quote_service_dependency
_override_extraction_service_dependency = quotes_test_module._override_extraction_service_dependency
_reset_rate_limiter = quotes_test_module._reset_rate_limiter
_create_customer = quotes_test_module._create_customer
_create_quote = quotes_test_module._create_quote
_credentials = quotes_test_module._credentials
_register_and_login = quotes_test_module._register_and_login
_set_quote_status = quotes_test_module._set_quote_status


async def test_mark_won_quote_returns_404_for_different_users_quote(
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
    response = await client.post(
        f"/api/quotes/{quote_id}/mark-won",
        headers={"X-CSRF-Token": csrf_token_user_b},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


@pytest.mark.parametrize(
    ("starting_status", "endpoint", "expected_status", "expected_event"),
    [
        (QuoteStatus.DRAFT, "mark-won", "approved", "quote_approved"),
        (QuoteStatus.READY, "mark-won", "approved", "quote_approved"),
        (QuoteStatus.SHARED, "mark-won", "approved", "quote_approved"),
        (QuoteStatus.VIEWED, "mark-won", "approved", "quote_approved"),
        (QuoteStatus.DRAFT, "mark-lost", "declined", "quote_marked_lost"),
        (QuoteStatus.READY, "mark-lost", "declined", "quote_marked_lost"),
        (QuoteStatus.SHARED, "mark-lost", "declined", "quote_marked_lost"),
        (QuoteStatus.VIEWED, "mark-lost", "declined", "quote_marked_lost"),
        (QuoteStatus.APPROVED, "mark-lost", "declined", "quote_marked_lost"),
        (QuoteStatus.DECLINED, "mark-won", "approved", "quote_approved"),
    ],
)
async def test_mark_quote_outcome_updates_status_and_persists_event_log(
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

    response = await client.post(
        f"/api/quotes/{quote_id}/{endpoint}",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == expected_status
    assert set(payload) == {
        "id",
        "customer_id",
        "doc_type",
        "doc_number",
        "title",
        "status",
        "source_type",
        "transcript",
        "total_amount",
        "tax_rate",
        "discount_type",
        "discount_value",
        "deposit_amount",
        "notes",
        "shared_at",
        "share_token",
        "line_items",
        "created_at",
        "updated_at",
    }
    assert expected_event in event_logger._PILOT_EVENT_NAMES  # noqa: SLF001
    assert [event["event"] for event in emitted_events][-1] == expected_event


@pytest.mark.parametrize(
    ("starting_status", "endpoint", "expected_status"),
    [
        (QuoteStatus.APPROVED, "mark-won", "approved"),
        (QuoteStatus.DECLINED, "mark-lost", "declined"),
    ],
)
async def test_mark_quote_outcome_is_idempotent_when_reapplying_same_terminal_status(
    client: AsyncClient,
    db_session: AsyncSession,
    starting_status: QuoteStatus,
    endpoint: str,
    expected_status: str,
) -> None:
    emitted_events: list[dict[str, str]] = []

    def _capture(message: str) -> None:
        emitted_events.append(json.loads(message))

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(event_logger._EVENT_LOGGER, "info", _capture)  # noqa: SLF001
    try:
        csrf_token = await _register_and_login(client, _credentials())
        customer_id = await _create_customer(client, csrf_token)
        quote = await _create_quote(client, csrf_token, customer_id)
        quote_id = quote["id"]

        share_response = await client.post(
            f"/api/quotes/{quote_id}/share",
            headers={"X-CSRF-Token": csrf_token},
        )
        assert share_response.status_code == 200
        await _set_quote_status(db_session, quote_id, starting_status)
        event_count_before_reapply = len(emitted_events)

        response = await client.post(
            f"/api/quotes/{quote_id}/{endpoint}",
            headers={"X-CSRF-Token": csrf_token},
        )

        assert response.status_code == 200
        assert response.json()["status"] == expected_status
        assert len(emitted_events) == event_count_before_reapply
    finally:
        monkeypatch.undo()


async def test_mark_quote_outcome_returns_409_when_atomic_write_loses_race(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _lose_race(
        self: QuoteRepository,
        *,
        quote_id: UUID,
        user_id: UUID,
        status: QuoteStatus,
        allowed_current_statuses: tuple[QuoteStatus, ...],
    ) -> Document | None:
        del self, quote_id, user_id, status, allowed_current_statuses
        return None

    monkeypatch.setattr(QuoteRepository, "set_quote_outcome", _lose_race)
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)
    quote_id = quote["id"]

    share_response = await client.post(
        f"/api/quotes/{quote_id}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200

    response = await client.post(
        f"/api/quotes/{quote_id}/mark-won",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "Unable to update quote outcome"}


@pytest.mark.parametrize(
    "status",
    [QuoteStatus.VIEWED, QuoteStatus.APPROVED, QuoteStatus.DECLINED],
)
async def test_patch_customer_visible_quote_statuses_preserves_status_and_share_fields(
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
    shared_quote = share_response.json()
    await _set_quote_status(db_session, quote_id, status)

    patch_response = await client.patch(
        f"/api/quotes/{quote_id}",
        json={"notes": "Updated note"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert patch_response.status_code == 200
    assert patch_response.json()["status"] == status.value
    assert patch_response.json()["notes"] == "Updated note"
    assert patch_response.json()["share_token"] == shared_quote["share_token"]
    assert patch_response.json()["shared_at"] == shared_quote["shared_at"]
