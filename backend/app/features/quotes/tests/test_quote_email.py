"""Quote send-email API behavior tests."""

from __future__ import annotations

import json
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.features.event_logs.models import EventLog
from app.features.quotes.models import QuoteStatus
from app.features.quotes.repository import QuoteRepository
from app.features.quotes.tests import test_quotes as quotes_test_module
from app.features.quotes.tests.support.helpers import (
    _assert_async_email_job_response,
    _create_customer,
    _create_quote,
    _credentials,
    _get_user_by_email,
    _register_and_login,
    _send_email_headers,
    _set_profile_for_email_delivery,
    _set_quote_status,
    _set_user_email_and_phone_number,
    _set_user_phone_number,
)
from app.features.quotes.tests.support.mocks import (
    _FailingAbortIdempotencyStore,
    _InProgressIdempotencyStore,
    _MockEmailService,
)
from app.main import app
from app.shared import event_logger, observability
from app.shared.dependencies import get_idempotency_store

pytestmark = pytest.mark.asyncio

# Reuse existing fixture wiring/helpers from test_quotes to preserve behavior.
_reset_email_delivery_fallback_cache = quotes_test_module._reset_email_delivery_fallback_cache
_override_storage_service_dependency = quotes_test_module._override_storage_service_dependency
_override_quote_service_dependency = quotes_test_module._override_quote_service_dependency
_override_extraction_service_dependency = quotes_test_module._override_extraction_service_dependency
_reset_rate_limiter = quotes_test_module._reset_rate_limiter
_mock_arq_pool_for_send_email_tests = quotes_test_module._mock_arq_pool_for_send_email_tests
mock_email_service = quotes_test_module.mock_email_service


async def test_send_quote_email_shares_quote_delivers_email_and_logs_success(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    emitted_events: list[dict[str, str]] = []

    def _capture(message: str) -> None:
        emitted_events.append(json.loads(message))

    monkeypatch.setattr(event_logger._EVENT_LOGGER, "info", _capture)  # noqa: SLF001

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
    quote = await _create_quote(client, csrf_token, customer_id)
    await _set_quote_status(db_session, quote["id"], QuoteStatus.READY)

    response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers=_send_email_headers(csrf_token),
    )

    payload = _assert_async_email_job_response(response, document_id=quote["id"])
    assert payload["id"]
    assert len(mock_email_service.messages) == 0
    quote_event_names = [
        payload["event"] for payload in emitted_events if payload.get("quote_id") == quote["id"]
    ]
    assert quote_event_names[-1:] == ["quote_shared"]


async def test_send_quote_email_requires_idempotency_key(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token, email="customer@example.com")
    quote = await _create_quote(client, csrf_token, customer_id)
    await _set_quote_status(db_session, quote["id"], QuoteStatus.READY)

    response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Idempotency-Key header is required"}
    assert mock_email_service.messages == []


async def test_send_quote_email_replays_same_idempotency_key_without_second_send(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    await _set_profile_for_email_delivery(client, csrf_token)
    customer_id = await _create_customer(client, csrf_token, email="customer@example.com")
    quote = await _create_quote(client, csrf_token, customer_id)
    await _set_quote_status(db_session, quote["id"], QuoteStatus.READY)

    first_response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="quote-replay"),
    )
    second_response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="quote-replay"),
    )

    first_payload = _assert_async_email_job_response(first_response, document_id=quote["id"])
    second_payload = _assert_async_email_job_response(second_response, document_id=quote["id"])
    assert second_response.headers["Idempotency-Replayed"] == "true"
    assert second_payload == first_payload
    assert len(mock_email_service.messages) == 0


async def test_send_quote_email_idempotency_replay_emits_structured_log(
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
    quote = await _create_quote(client, csrf_token, customer_id)
    await _set_quote_status(db_session, quote["id"], QuoteStatus.READY)

    first_response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="quote-replay-observed"),
    )
    second_response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="quote-replay-observed"),
    )

    _assert_async_email_job_response(first_response, document_id=quote["id"])
    _assert_async_email_job_response(second_response, document_id=quote["id"])
    replay_event = next(
        payload for payload in captured if payload.get("event") == "idempotency.replay"
    )
    assert replay_event["reason"] == "replayed_response"
    assert replay_event["status_code"] == 202
    assert replay_event["endpoint_slug"] == "quote-send-email"
    assert replay_event["resource_id"] == quote["id"]


async def test_send_quote_email_uses_reply_copy_when_phone_is_missing(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
) -> None:
    credentials = _credentials()
    csrf_token = await _register_and_login(client, credentials)
    await _set_profile_for_email_delivery(client, csrf_token)
    customer_id = await _create_customer(
        client,
        csrf_token,
        name="Alice Johnson",
        email="alice@example.com",
    )
    quote = await _create_quote(client, csrf_token, customer_id)
    await _set_quote_status(db_session, quote["id"], QuoteStatus.READY)

    response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers=_send_email_headers(csrf_token),
    )

    _assert_async_email_job_response(response, document_id=quote["id"])
    assert len(mock_email_service.messages) == 0


async def test_send_quote_email_uses_neutral_contact_copy_when_phone_and_email_are_missing(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
) -> None:
    credentials = _credentials()
    csrf_token = await _register_and_login(client, credentials)
    await _set_profile_for_email_delivery(client, csrf_token)
    await _set_user_email_and_phone_number(
        db_session,
        email=credentials["email"],
        updated_email="",
        phone_number=None,
    )
    customer_id = await _create_customer(
        client,
        csrf_token,
        name="Alice Johnson",
        email="alice@example.com",
    )
    quote = await _create_quote(client, csrf_token, customer_id)
    await _set_quote_status(db_session, quote["id"], QuoteStatus.READY)

    response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers=_send_email_headers(csrf_token),
    )

    _assert_async_email_job_response(response, document_id=quote["id"])
    assert len(mock_email_service.messages) == 0


@pytest.mark.parametrize(
    ("customer_email", "expected_detail"),
    [
        (None, "Add a customer email before sending this quote."),
        ("not-an-email", "Customer email address looks invalid."),
    ],
)
async def test_send_quote_email_returns_422_for_missing_or_invalid_customer_email(
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
    quote = await _create_quote(client, csrf_token, customer_id)
    await _set_quote_status(db_session, quote["id"], QuoteStatus.READY)

    response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers=_send_email_headers(csrf_token),
    )

    assert response.status_code == 422
    assert response.json() == {"detail": expected_detail}
    assert mock_email_service.messages == []


async def test_send_quote_email_returns_409_when_quote_is_still_draft(
    client: AsyncClient,
    mock_email_service: _MockEmailService,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(
        client,
        csrf_token,
        email="customer@example.com",
    )
    quote = await _create_quote(client, csrf_token, customer_id)

    response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers=_send_email_headers(csrf_token),
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Generate the PDF before sending this quote by email.",
    }
    assert mock_email_service.messages == []


@pytest.mark.parametrize("terminal_status", [QuoteStatus.APPROVED, QuoteStatus.DECLINED])
async def test_send_quote_email_allows_resend_for_finalized_quotes_without_rotating_share_token(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
    terminal_status: QuoteStatus,
) -> None:
    credentials = _credentials()
    csrf_token = await _register_and_login(client, credentials)
    await _set_profile_for_email_delivery(client, csrf_token)
    customer_id = await _create_customer(
        client,
        csrf_token,
        email="customer@example.com",
    )
    quote = await _create_quote(client, csrf_token, customer_id)
    await _set_quote_status(db_session, quote["id"], QuoteStatus.READY)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200

    await _set_quote_status(db_session, quote["id"], terminal_status)

    response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers=_send_email_headers(csrf_token),
    )

    _assert_async_email_job_response(response, document_id=quote["id"])
    assert len(mock_email_service.messages) == 0


async def test_send_quote_email_returns_404_for_missing_quote(
    client: AsyncClient,
    mock_email_service: _MockEmailService,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        f"/api/quotes/{uuid4()}/send-email",
        headers=_send_email_headers(csrf_token),
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}
    assert mock_email_service.messages == []


async def test_send_quote_email_returns_404_for_different_users_quote(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
) -> None:
    csrf_token_user_a = await _register_and_login(client, _credentials())
    customer_id_user_a = await _create_customer(
        client,
        csrf_token_user_a,
        email="customer@example.com",
    )
    quote = await _create_quote(client, csrf_token_user_a, customer_id_user_a)
    await _set_quote_status(db_session, quote["id"], QuoteStatus.READY)

    csrf_token_user_b = await _register_and_login(client, _credentials())
    response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers=_send_email_headers(csrf_token_user_b),
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}
    assert mock_email_service.messages == []


async def test_send_quote_email_returns_429_when_duplicate_send_guard_triggers(
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
    quote = await _create_quote(client, csrf_token, customer_id)
    await _set_quote_status(db_session, quote["id"], QuoteStatus.READY)
    user = await _get_user_by_email(db_session, credentials["email"])
    db_session.add(
        EventLog(
            user_id=user.id,
            event_name="email_sent",
            metadata_json={"quote_id": quote["id"], "customer_id": customer_id},
        )
    )
    await db_session.commit()

    response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers=_send_email_headers(csrf_token),
    )

    assert response.status_code == 429
    assert response.json() == {
        "detail": "This quote was emailed recently. Please wait a few minutes before resending.",
    }
    assert mock_email_service.messages == []


async def test_send_quote_email_allows_new_idempotency_key_while_delivery_is_pending(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
) -> None:
    credentials = _credentials()
    csrf_token = await _register_and_login(client, credentials)
    await _set_profile_for_email_delivery(client, csrf_token)
    customer_id = await _create_customer(
        client,
        csrf_token,
        email="customer@example.com",
    )
    quote = await _create_quote(client, csrf_token, customer_id)
    await _set_quote_status(db_session, quote["id"], QuoteStatus.READY)

    first_response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="quote-send-1"),
    )
    second_response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="quote-send-2"),
    )

    _assert_async_email_job_response(first_response, document_id=quote["id"])
    _assert_async_email_job_response(second_response, document_id=quote["id"])
    assert len(mock_email_service.messages) == 0


async def test_send_quote_email_slowapi_rate_limit_returns_429(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(app.state.limiter, "enabled", True)
    monkeypatch.setenv("QUOTE_EMAIL_SEND_RATE_LIMIT", "1/minute")
    get_settings.cache_clear()
    credentials = _credentials()
    csrf_token = await _register_and_login(client, credentials)
    await _set_profile_for_email_delivery(client, csrf_token)
    customer_id = await _create_customer(
        client,
        csrf_token,
        email="customer@example.com",
    )
    quote = await _create_quote(client, csrf_token, customer_id)
    await _set_quote_status(db_session, quote["id"], QuoteStatus.READY)

    first_response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="quote-rate-limit-1"),
    )
    second_response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="quote-rate-limit-2"),
    )

    assert first_response.status_code == 202
    assert second_response.status_code == 429
    assert "Rate limit exceeded" in second_response.json()["error"]
    assert len(mock_email_service.messages) == 0


@pytest.mark.parametrize("starting_status", [QuoteStatus.SHARED, QuoteStatus.VIEWED])
async def test_send_quote_email_resends_without_changing_existing_shared_status(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
    starting_status: QuoteStatus,
) -> None:
    credentials = _credentials()
    csrf_token = await _register_and_login(client, credentials)
    await _set_profile_for_email_delivery(client, csrf_token)
    customer_id = await _create_customer(
        client,
        csrf_token,
        email="customer@example.com",
    )
    quote = await _create_quote(client, csrf_token, customer_id)
    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200

    if starting_status == QuoteStatus.VIEWED:
        await _set_quote_status(db_session, quote["id"], QuoteStatus.VIEWED)

    response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers=_send_email_headers(csrf_token),
    )

    _assert_async_email_job_response(response, document_id=quote["id"])
    assert len(mock_email_service.messages) == 0


@pytest.mark.skip(reason="Replaced by worker email job tests in async delivery flow.")
async def test_send_quote_email_returns_200_when_event_persist_fails_after_send(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    credentials = _credentials()
    csrf_token = await _register_and_login(client, credentials)
    await _set_profile_for_email_delivery(client, csrf_token)
    customer_id = await _create_customer(
        client,
        csrf_token,
        email="customer@example.com",
    )
    quote = await _create_quote(client, csrf_token, customer_id)
    await _set_quote_status(db_session, quote["id"], QuoteStatus.READY)
    rollback_calls = 0

    async def _raise_persist_failure(
        self: QuoteRepository,
        *,
        user_id: UUID,
        quote_id: UUID,
        customer_id: UUID,
        event_name: str,
    ) -> None:
        del self, user_id, quote_id, customer_id, event_name
        raise RuntimeError("event log unavailable")

    async def _record_rollback(self: QuoteRepository) -> None:
        nonlocal rollback_calls
        del self
        rollback_calls += 1

    monkeypatch.setattr(QuoteRepository, "persist_quote_event", _raise_persist_failure)
    monkeypatch.setattr(QuoteRepository, "rollback", _record_rollback)

    first_response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="quote-fallback-persist-1"),
    )
    second_response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="quote-fallback-persist-2"),
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 429
    assert second_response.json() == {
        "detail": "This quote was emailed recently. Please wait a few minutes before resending.",
    }
    assert len(mock_email_service.messages) == 1
    assert rollback_calls == 1


@pytest.mark.skip(reason="Replaced by worker email job tests in async delivery flow.")
async def test_send_quote_email_returns_200_when_event_commit_fails_after_send(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    credentials = _credentials()
    csrf_token = await _register_and_login(client, credentials)
    await _set_profile_for_email_delivery(client, csrf_token)
    customer_id = await _create_customer(
        client,
        csrf_token,
        email="customer@example.com",
    )
    quote = await _create_quote(client, csrf_token, customer_id)
    await _set_quote_status(db_session, quote["id"], QuoteStatus.READY)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    await _set_quote_status(db_session, quote["id"], QuoteStatus.VIEWED)

    rollback_calls = 0

    async def _raise_commit_failure(self: QuoteRepository) -> None:
        del self
        raise RuntimeError("commit failed")

    async def _record_rollback(self: QuoteRepository) -> None:
        nonlocal rollback_calls
        del self
        rollback_calls += 1

    monkeypatch.setattr(QuoteRepository, "commit", _raise_commit_failure)
    monkeypatch.setattr(QuoteRepository, "rollback", _record_rollback)

    first_response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="quote-fallback-commit-1"),
    )
    second_response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="quote-fallback-commit-2"),
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 429
    assert second_response.json() == {
        "detail": "This quote was emailed recently. Please wait a few minutes before resending.",
    }
    assert len(mock_email_service.messages) == 1
    assert rollback_calls == 1


@pytest.mark.skip(reason="Replaced by worker email job tests in async delivery flow.")
async def test_send_quote_email_allows_immediate_retry_after_provider_failure(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
) -> None:
    credentials = _credentials()
    csrf_token = await _register_and_login(client, credentials)
    await _set_profile_for_email_delivery(client, csrf_token)
    customer_id = await _create_customer(
        client,
        csrf_token,
        email="customer@example.com",
    )
    quote = await _create_quote(client, csrf_token, customer_id)
    await _set_quote_status(db_session, quote["id"], QuoteStatus.READY)
    mock_email_service.raise_send_error = True

    first_response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="quote-provider-failure"),
    )
    mock_email_service.raise_send_error = False
    second_response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="quote-provider-failure"),
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
async def test_send_quote_email_surfaces_provider_failures_with_expected_status_codes(
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
    quote = await _create_quote(client, csrf_token, customer_id)
    await _set_quote_status(db_session, quote["id"], QuoteStatus.READY)
    mock_email_service.raise_configuration_error = raise_configuration_error
    mock_email_service.raise_send_error = raise_send_error

    response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers=_send_email_headers(csrf_token),
    )

    assert response.status_code == expected_status
    assert response.json() == {"detail": expected_detail}

    detail_response = await client.get(f"/api/quotes/{quote['id']}")
    assert detail_response.status_code == 200
    assert detail_response.json()["status"] == "shared"


async def test_send_quote_email_preserves_original_error_when_idempotency_abort_fails(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    app.dependency_overrides[get_idempotency_store] = lambda: _FailingAbortIdempotencyStore()
    try:
        csrf_token = await _register_and_login(client, _credentials())
        customer_id = await _create_customer(client, csrf_token, email="not-an-email")
        quote = await _create_quote(client, csrf_token, customer_id)
        await _set_quote_status(db_session, quote["id"], QuoteStatus.READY)

        response = await client.post(
            f"/api/quotes/{quote['id']}/send-email",
            headers=_send_email_headers(csrf_token),
        )
    finally:
        app.dependency_overrides.pop(get_idempotency_store, None)

    assert response.status_code == 422
    assert response.json() == {"detail": "Customer email address looks invalid."}


async def test_send_quote_email_returns_409_when_idempotency_key_is_in_progress(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
) -> None:
    app.dependency_overrides[get_idempotency_store] = lambda: _InProgressIdempotencyStore()
    try:
        csrf_token = await _register_and_login(client, _credentials())
        customer_id = await _create_customer(client, csrf_token, email="customer@example.com")
        quote = await _create_quote(client, csrf_token, customer_id)
        await _set_quote_status(db_session, quote["id"], QuoteStatus.READY)

        response = await client.post(
            f"/api/quotes/{quote['id']}/send-email",
            headers=_send_email_headers(csrf_token),
        )
    finally:
        app.dependency_overrides.pop(get_idempotency_store, None)

    assert response.status_code == 409
    assert response.json() == {
        "detail": "A request with this Idempotency-Key is already in progress."
    }
    assert mock_email_service.messages == []


async def test_send_email_rejects_same_idempotency_key_for_different_resource_fingerprint(
    client: AsyncClient,
    db_session: AsyncSession,
    mock_email_service: _MockEmailService,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    await _set_profile_for_email_delivery(client, csrf_token)
    customer_id = await _create_customer(client, csrf_token, email="customer@example.com")
    first_quote = await _create_quote(client, csrf_token, customer_id)
    second_quote = await _create_quote(client, csrf_token, customer_id)
    await _set_quote_status(db_session, first_quote["id"], QuoteStatus.READY)
    await _set_quote_status(db_session, second_quote["id"], QuoteStatus.READY)

    first_response = await client.post(
        f"/api/quotes/{first_quote['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="shared-key"),
    )
    second_response = await client.post(
        f"/api/quotes/{second_quote['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="shared-key"),
    )

    _assert_async_email_job_response(first_response, document_id=first_quote["id"])
    assert second_response.status_code == 409
    assert second_response.json() == {
        "detail": "Idempotency key was already used for a different request.",
    }
    assert len(mock_email_service.messages) == 0
