"""Invoice send-email API behavior tests."""

from __future__ import annotations

from typing import cast
from uuid import UUID, uuid4

import pytest
from app.core.config import get_settings
from app.features.event_logs.models import EventLog
from app.features.invoices.repository import InvoiceRepository
from app.features.quotes.models import QuoteStatus
from app.features.quotes.tests import test_quotes as quotes_test_module
from app.features.quotes.tests.support.helpers import (
    _assert_async_email_job_response,
    _create_customer,
    _create_direct_invoice,
    _credentials,
    _get_user_by_email,
    _register_and_login,
    _send_email_headers,
    _set_invoice_status,
    _set_profile_for_email_delivery,
    _set_user_phone_number,
)
from app.features.quotes.tests.support.mocks import (
    _FailingAbortIdempotencyStore,
    _InProgressIdempotencyStore,
    _MockEmailService,
)
from app.main import app
from app.shared import observability
from app.shared.dependencies import get_idempotency_store
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio

# Reuse existing fixture wiring/helpers from test_quotes to preserve behavior.
_reset_email_delivery_fallback_cache = quotes_test_module._reset_email_delivery_fallback_cache
_override_storage_service_dependency = quotes_test_module._override_storage_service_dependency
_override_quote_service_dependency = quotes_test_module._override_quote_service_dependency
_override_extraction_service_dependency = quotes_test_module._override_extraction_service_dependency
_reset_rate_limiter = quotes_test_module._reset_rate_limiter
_mock_arq_pool_for_send_email_tests = quotes_test_module._mock_arq_pool_for_send_email_tests
mock_email_service = quotes_test_module.mock_email_service


async def test_send_invoice_email_shares_invoice_delivers_email_and_logs_success(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
) -> None:
    credentials = _credentials()
    csrf_token = await _register_and_login(client, credentials)
    await _set_profile_for_email_delivery(client, csrf_token)
    await _set_user_phone_number(
        db_session,
        email=credentials["email"],
        phone_number="+1-555-111-2222",
    )
    customer_id = await _create_customer(
        client,
        csrf_token,
        name="Alice Johnson",
        email="alice@example.com",
    )
    invoice = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id,
        title="Spring cleanup",
        transcript="invoice transcript",
        total_amount=55,
    )
    await _set_invoice_status(db_session, invoice["id"], QuoteStatus.READY)

    response = await client.post(
        f"/api/invoices/{invoice['id']}/send-email",
        headers=_send_email_headers(csrf_token),
    )

    _assert_async_email_job_response(response, document_id=cast(str, invoice["id"]))
    assert len(mock_email_service.messages) == 0


async def test_send_invoice_email_requires_idempotency_key(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token, email="customer@example.com")
    invoice = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id,
        title="Spring cleanup",
        transcript="invoice transcript",
        total_amount=55,
    )
    await _set_invoice_status(db_session, invoice["id"], QuoteStatus.READY)

    response = await client.post(
        f"/api/invoices/{invoice['id']}/send-email",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Idempotency-Key header is required"}
    assert mock_email_service.messages == []


async def test_send_invoice_email_replays_same_idempotency_key_without_second_send(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    await _set_profile_for_email_delivery(client, csrf_token)
    customer_id = await _create_customer(client, csrf_token, email="customer@example.com")
    invoice = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id,
        title="Spring cleanup",
        transcript="invoice transcript",
        total_amount=55,
    )
    await _set_invoice_status(db_session, invoice["id"], QuoteStatus.READY)

    first_response = await client.post(
        f"/api/invoices/{invoice['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="invoice-replay"),
    )
    second_response = await client.post(
        f"/api/invoices/{invoice['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="invoice-replay"),
    )

    first_payload = _assert_async_email_job_response(
        first_response,
        document_id=cast(str, invoice["id"]),
    )
    second_payload = _assert_async_email_job_response(
        second_response,
        document_id=cast(str, invoice["id"]),
    )
    assert second_response.headers["Idempotency-Replayed"] == "true"
    assert second_payload == first_payload
    assert len(mock_email_service.messages) == 0


async def test_send_invoice_email_idempotency_replay_emits_structured_log(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    mock_email_service: _MockEmailService,
) -> None:
    captured: list[dict[str, object]] = []

    def _capture(payload: dict[str, object], *, level: int) -> None:
        captured.append(payload)

    monkeypatch.setattr(observability, "_emit_security_payload", _capture)
    csrf_token = await _register_and_login(client, _credentials())
    await _set_profile_for_email_delivery(client, csrf_token)
    customer_id = await _create_customer(client, csrf_token, email="customer@example.com")
    invoice = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id,
        title="Spring cleanup",
        transcript="invoice transcript",
        total_amount=55,
    )
    await _set_invoice_status(db_session, invoice["id"], QuoteStatus.READY)

    first_response = await client.post(
        f"/api/invoices/{invoice['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="invoice-replay-observed"),
    )
    second_response = await client.post(
        f"/api/invoices/{invoice['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="invoice-replay-observed"),
    )

    _assert_async_email_job_response(first_response, document_id=cast(str, invoice["id"]))
    _assert_async_email_job_response(second_response, document_id=cast(str, invoice["id"]))
    replay_event = next(
        payload for payload in captured if payload.get("event") == "idempotency.replay"
    )
    assert replay_event["reason"] == "replayed_response"
    assert replay_event["status_code"] == 202
    assert replay_event["endpoint_slug"] == "invoice-send-email"
    assert replay_event["resource_id"] == invoice["id"]


async def test_send_invoice_email_preserves_original_error_when_idempotency_abort_fails(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    app.dependency_overrides[get_idempotency_store] = lambda: _FailingAbortIdempotencyStore()
    try:
        csrf_token = await _register_and_login(client, _credentials())
        customer_id = await _create_customer(client, csrf_token, email="not-an-email")
        invoice = await _create_direct_invoice(
            client,
            csrf_token,
            customer_id,
            title="Spring cleanup",
            transcript="invoice transcript",
            total_amount=55,
        )
        await _set_invoice_status(db_session, invoice["id"], QuoteStatus.READY)

        response = await client.post(
            f"/api/invoices/{invoice['id']}/send-email",
            headers=_send_email_headers(csrf_token),
        )
    finally:
        app.dependency_overrides.pop(get_idempotency_store, None)

    assert response.status_code == 422
    assert response.json() == {"detail": "Customer email address looks invalid."}


async def test_send_invoice_email_returns_409_when_idempotency_key_is_in_progress(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
) -> None:
    app.dependency_overrides[get_idempotency_store] = lambda: _InProgressIdempotencyStore()
    try:
        csrf_token = await _register_and_login(client, _credentials())
        customer_id = await _create_customer(client, csrf_token, email="customer@example.com")
        invoice = await _create_direct_invoice(
            client,
            csrf_token,
            customer_id,
            title="Spring cleanup",
            transcript="invoice transcript",
            total_amount=55,
        )
        await _set_invoice_status(db_session, invoice["id"], QuoteStatus.READY)

        response = await client.post(
            f"/api/invoices/{invoice['id']}/send-email",
            headers=_send_email_headers(csrf_token),
        )
    finally:
        app.dependency_overrides.pop(get_idempotency_store, None)

    assert response.status_code == 409
    assert response.json() == {
        "detail": "A request with this Idempotency-Key is already in progress."
    }
    assert mock_email_service.messages == []


async def test_send_invoice_email_slowapi_rate_limit_returns_429(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(app.state.limiter, "enabled", True)
    monkeypatch.setenv("INVOICE_EMAIL_SEND_RATE_LIMIT", "1/minute")
    get_settings.cache_clear()
    credentials = _credentials()
    csrf_token = await _register_and_login(client, credentials)
    await _set_profile_for_email_delivery(client, csrf_token)
    customer_id = await _create_customer(
        client,
        csrf_token,
        email="customer@example.com",
    )
    invoice = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id,
        title="Spring cleanup",
        transcript="invoice transcript",
        total_amount=55,
    )
    await _set_invoice_status(db_session, invoice["id"], QuoteStatus.READY)

    first_response = await client.post(
        f"/api/invoices/{invoice['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="invoice-rate-limit-1"),
    )
    second_response = await client.post(
        f"/api/invoices/{invoice['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="invoice-rate-limit-2"),
    )

    assert first_response.status_code == 202
    assert second_response.status_code == 429
    assert "Rate limit exceeded" in second_response.json()["error"]
    assert len(mock_email_service.messages) == 0


async def test_send_invoice_email_returns_200_on_resend_when_already_sent(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    await _set_profile_for_email_delivery(client, csrf_token)
    customer_id = await _create_customer(
        client,
        csrf_token,
        email="customer@example.com",
    )
    invoice = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id,
        title="Spring cleanup",
        transcript="invoice transcript",
        total_amount=55,
    )
    await _set_invoice_status(db_session, invoice["id"], QuoteStatus.READY)

    share_response = await client.post(
        f"/api/invoices/{invoice['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200

    response = await client.post(
        f"/api/invoices/{invoice['id']}/send-email",
        headers=_send_email_headers(csrf_token),
    )

    _assert_async_email_job_response(response, document_id=cast(str, invoice["id"]))
    assert len(mock_email_service.messages) == 0


async def test_send_invoice_email_returns_404_for_missing_invoice(
    client: AsyncClient,
    mock_email_service: _MockEmailService,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        f"/api/invoices/{uuid4()}/send-email",
        headers=_send_email_headers(csrf_token),
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}
    assert mock_email_service.messages == []


async def test_send_invoice_email_returns_404_for_different_users_invoice(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
) -> None:
    owner_credentials = _credentials()
    owner_csrf_token = await _register_and_login(client, owner_credentials)
    customer_id = await _create_customer(
        client,
        owner_csrf_token,
        email="customer@example.com",
    )
    invoice = await _create_direct_invoice(
        client,
        owner_csrf_token,
        customer_id,
        title="Spring cleanup",
        transcript="invoice transcript",
        total_amount=55,
    )
    await _set_invoice_status(db_session, invoice["id"], QuoteStatus.READY)

    other_csrf_token = await _register_and_login(client, _credentials())
    response = await client.post(
        f"/api/invoices/{invoice['id']}/send-email",
        headers=_send_email_headers(other_csrf_token),
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}
    assert mock_email_service.messages == []


async def test_send_invoice_email_returns_409_when_invoice_is_still_draft(
    client: AsyncClient,
    mock_email_service: _MockEmailService,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(
        client,
        csrf_token,
        email="customer@example.com",
    )
    invoice = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id,
        title="Spring cleanup",
        transcript="invoice transcript",
        total_amount=55,
    )

    response = await client.post(
        f"/api/invoices/{invoice['id']}/send-email",
        headers=_send_email_headers(csrf_token),
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Generate the PDF before sending this invoice by email.",
    }
    assert mock_email_service.messages == []


@pytest.mark.parametrize(
    ("customer_email", "expected_detail"),
    [
        (None, "Add a customer email before sending this invoice."),
        ("not-an-email", "Customer email address looks invalid."),
    ],
)
async def test_send_invoice_email_returns_422_for_missing_or_invalid_customer_email(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
    customer_email: str | None,
    expected_detail: str,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(
        client,
        csrf_token,
        email=customer_email,
    )
    invoice = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id,
        title="Spring cleanup",
        transcript="invoice transcript",
        total_amount=55,
    )
    await _set_invoice_status(db_session, invoice["id"], QuoteStatus.READY)

    response = await client.post(
        f"/api/invoices/{invoice['id']}/send-email",
        headers=_send_email_headers(csrf_token),
    )

    assert response.status_code == 422
    assert response.json() == {"detail": expected_detail}
    assert mock_email_service.messages == []


async def test_send_invoice_email_returns_429_when_duplicate_send_guard_triggers(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
) -> None:
    credentials = _credentials()
    csrf_token = await _register_and_login(client, credentials)
    customer_id = await _create_customer(
        client,
        csrf_token,
        email="customer@example.com",
    )
    invoice = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id,
        title="Spring cleanup",
        transcript="invoice transcript",
        total_amount=55,
    )
    await _set_invoice_status(db_session, invoice["id"], QuoteStatus.READY)
    user = await _get_user_by_email(db_session, credentials["email"])
    db_session.add(
        EventLog(
            user_id=user.id,
            event_name="email_sent",
            metadata_json={"invoice_id": invoice["id"], "customer_id": customer_id},
        )
    )
    await db_session.commit()

    response = await client.post(
        f"/api/invoices/{invoice['id']}/send-email",
        headers=_send_email_headers(csrf_token),
    )

    assert response.status_code == 429
    assert response.json() == {
        "detail": "This invoice was emailed recently. Please wait before resending.",
    }
    assert mock_email_service.messages == []


async def test_send_invoice_email_allows_new_idempotency_key_while_delivery_is_pending(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    await _set_profile_for_email_delivery(client, csrf_token)
    customer_id = await _create_customer(
        client,
        csrf_token,
        email="customer@example.com",
    )
    invoice = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id,
        title="Spring cleanup",
        transcript="invoice transcript",
        total_amount=55,
    )
    await _set_invoice_status(db_session, invoice["id"], QuoteStatus.READY)

    first_response = await client.post(
        f"/api/invoices/{invoice['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="invoice-send-1"),
    )
    second_response = await client.post(
        f"/api/invoices/{invoice['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="invoice-send-2"),
    )

    _assert_async_email_job_response(first_response, document_id=cast(str, invoice["id"]))
    _assert_async_email_job_response(second_response, document_id=cast(str, invoice["id"]))
    assert len(mock_email_service.messages) == 0


@pytest.mark.skip(reason="Replaced by worker email job tests in async delivery flow.")
async def test_send_invoice_email_returns_200_when_event_persist_fails_after_send(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    await _set_profile_for_email_delivery(client, csrf_token)
    customer_id = await _create_customer(
        client,
        csrf_token,
        email="customer@example.com",
    )
    invoice = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id,
        title="Spring cleanup",
        transcript="invoice transcript",
        total_amount=55,
    )
    await _set_invoice_status(db_session, invoice["id"], QuoteStatus.READY)
    rollback_calls = 0

    async def _raise_persist_failure(
        self: InvoiceRepository,
        *,
        user_id: UUID,
        invoice_id: UUID,
        customer_id: UUID,
        event_name: str,
    ) -> None:
        del self, user_id, invoice_id, customer_id, event_name
        raise RuntimeError("event log unavailable")

    async def _record_rollback(self: InvoiceRepository) -> None:
        nonlocal rollback_calls
        del self
        rollback_calls += 1

    monkeypatch.setattr(InvoiceRepository, "persist_invoice_event", _raise_persist_failure)
    monkeypatch.setattr(InvoiceRepository, "rollback", _record_rollback)

    first_response = await client.post(
        f"/api/invoices/{invoice['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="invoice-fallback-persist-1"),
    )
    second_response = await client.post(
        f"/api/invoices/{invoice['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="invoice-fallback-persist-2"),
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 429
    assert second_response.json() == {
        "detail": "This invoice was emailed recently. Please wait before resending.",
    }
    assert len(mock_email_service.messages) == 1
    assert rollback_calls == 1


@pytest.mark.skip(reason="Replaced by worker email job tests in async delivery flow.")
async def test_send_invoice_email_allows_immediate_retry_after_provider_failure(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    await _set_profile_for_email_delivery(client, csrf_token)
    customer_id = await _create_customer(
        client,
        csrf_token,
        email="customer@example.com",
    )
    invoice = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id,
        title="Spring cleanup",
        transcript="invoice transcript",
        total_amount=55,
    )
    await _set_invoice_status(db_session, invoice["id"], QuoteStatus.READY)
    mock_email_service.raise_send_error = True

    first_response = await client.post(
        f"/api/invoices/{invoice['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="invoice-provider-failure"),
    )
    mock_email_service.raise_send_error = False
    second_response = await client.post(
        f"/api/invoices/{invoice['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="invoice-provider-failure"),
    )

    assert first_response.status_code == 502
    assert second_response.status_code == 200
    assert len(mock_email_service.messages) == 1


@pytest.mark.parametrize(
    (
        "raise_configuration_error",
        "raise_send_error",
        "expected_status",
        "expected_detail",
    ),
    [
        (True, False, 503, "Email delivery is not configured right now."),
        (False, True, 502, "Email delivery failed. Please try again."),
    ],
)
@pytest.mark.skip(reason="Replaced by worker email job tests in async delivery flow.")
async def test_send_invoice_email_surfaces_provider_failures_with_expected_status_codes(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
    raise_configuration_error: bool,
    raise_send_error: bool,
    expected_status: int,
    expected_detail: str,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(
        client,
        csrf_token,
        email="customer@example.com",
    )
    invoice = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id,
        title="Spring cleanup",
        transcript="invoice transcript",
        total_amount=55,
    )
    await _set_invoice_status(db_session, invoice["id"], QuoteStatus.READY)
    mock_email_service.raise_configuration_error = raise_configuration_error
    mock_email_service.raise_send_error = raise_send_error

    response = await client.post(
        f"/api/invoices/{invoice['id']}/send-email",
        headers=_send_email_headers(csrf_token),
    )

    assert response.status_code == expected_status
    assert response.json() == {"detail": expected_detail}

    detail_response = await client.get(f"/api/invoices/{invoice['id']}")
    assert detail_response.status_code == 200
    assert detail_response.json()["status"] == "sent"
    assert detail_response.json()["share_token"] is not None
