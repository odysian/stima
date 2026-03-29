"""Quote API behavior tests for extraction, CRUD flow, and ownership scoping."""

from __future__ import annotations

import json
from collections.abc import Iterator, Sequence
from typing import Annotated
from uuid import UUID, uuid4

import pytest
from fastapi import Depends
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.features.auth.models import User
from app.features.auth.service import CSRF_COOKIE_NAME
from app.features.event_logs.models import EventLog
from app.features.quotes import api as quote_api
from app.features.quotes import email_delivery_service
from app.features.quotes.extraction_service import ExtractionService
from app.features.quotes.models import Document, LineItem, QuoteStatus
from app.features.quotes.repository import QuoteRenderContext, QuoteRepository
from app.features.quotes.schemas import ExtractionResult, LineItemExtracted
from app.features.quotes.service import QuoteService
from app.integrations.audio import AudioClip, AudioError
from app.integrations.email import (
    EmailConfigurationError,
    EmailMessage,
    EmailSendError,
)
from app.integrations.extraction import ExtractionError
from app.integrations.storage import StorageNotFoundError
from app.integrations.transcription import TranscriptionError
from app.main import app
from app.shared import event_logger
from app.shared.dependencies import (
    get_email_service,
    get_extraction_service,
    get_quote_service,
    get_storage_service,
)

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _reset_email_delivery_fallback_cache() -> Iterator[None]:
    email_delivery_service._EMAIL_SENT_FALLBACK_TIMESTAMPS.clear()  # noqa: SLF001
    yield
    email_delivery_service._EMAIL_SENT_FALLBACK_TIMESTAMPS.clear()  # noqa: SLF001


class _MockExtractionIntegration:
    async def extract(self, notes: str) -> ExtractionResult:
        if "malformed" in notes.lower():
            raise ExtractionError("mock malformed extraction payload")

        normalized_notes = notes.strip()
        if "needs-review" in normalized_notes.lower() or normalized_notes.startswith(
            "transcript from stitched"
        ):
            return ExtractionResult(
                transcript=normalized_notes,
                line_items=[
                    LineItemExtracted(
                        description="Brown mulch",
                        details="5 yards",
                        price=120,
                        flagged=True,
                        flag_reason="Unit or price sounds inconsistent with the transcript",
                    )
                ],
                total=120,
                confidence_notes=[],
            )

        return ExtractionResult(
            transcript=normalized_notes,
            line_items=[
                LineItemExtracted(
                    description="Brown mulch",
                    details="5 yards",
                    price=120,
                )
            ],
            total=120,
            confidence_notes=[],
        )


class _MockPdfIntegration:
    def render(self, context: QuoteRenderContext) -> bytes:
        return f"PDF for {context.doc_number}".encode()


class _MockAudioIntegration:
    def normalize_and_stitch(self, clips: Sequence[AudioClip]) -> bytes:
        if not clips:
            raise AudioError("At least one audio clip is required")

        if any(len(clip.content) == 0 for clip in clips):
            raise AudioError("Audio clip is empty")

        if any(clip.content == b"unsupported" for clip in clips):
            raise AudioError("Audio clip format is not supported or file is corrupted")

        if any(clip.content == b"trigger-transcription-error" for clip in clips):
            return b"trigger-transcription-error"

        return f"stitched-{len(clips)}".encode()


class _MockTranscriptionIntegration:
    async def transcribe(self, audio_wav: bytes) -> str:
        if audio_wav == b"trigger-transcription-error":
            raise TranscriptionError("mock transcription outage")
        return f"transcript from {audio_wav.decode()}"


class _MockStorageService:
    def fetch_bytes(self, object_path: str) -> bytes:
        raise StorageNotFoundError(object_path)

    def upload(
        self,
        *,
        prefix: str,
        filename: str,
        data: bytes,
        content_type: str,
    ) -> str:
        del data
        del content_type
        return f"{prefix.strip('/')}/{filename.lstrip('/')}"

    def delete(self, object_path: str) -> None:
        del object_path


class _MockEmailService:
    def __init__(self) -> None:
        self.messages: list[EmailMessage] = []
        self.raise_configuration_error = False
        self.raise_send_error = False

    async def send(self, message: EmailMessage) -> None:
        if self.raise_configuration_error:
            raise EmailConfigurationError("Email delivery is not configured")
        if self.raise_send_error:
            raise EmailSendError("Provider failure")
        self.messages.append(message)


@pytest.fixture(autouse=True)
def _override_storage_service_dependency() -> Iterator[None]:
    app.dependency_overrides[get_storage_service] = lambda: _MockStorageService()
    yield
    app.dependency_overrides.pop(get_storage_service, None)


@pytest.fixture
def mock_email_service() -> Iterator[_MockEmailService]:
    service = _MockEmailService()
    app.dependency_overrides[get_email_service] = lambda: service
    yield service
    app.dependency_overrides.pop(get_email_service, None)


@pytest.fixture(autouse=True)
def _override_quote_service_dependency() -> Iterator[None]:
    async def _override_get_quote_service(
        db: Annotated[AsyncSession, Depends(get_db)],
    ) -> QuoteService:
        return QuoteService(
            repository=QuoteRepository(db),
            pdf_integration=_MockPdfIntegration(),
            storage_service=_MockStorageService(),
        )

    app.dependency_overrides[get_quote_service] = _override_get_quote_service
    yield
    app.dependency_overrides.pop(get_quote_service, None)


@pytest.fixture(autouse=True)
def _override_extraction_service_dependency() -> Iterator[None]:
    async def _override_get_extraction_service() -> ExtractionService:
        return ExtractionService(
            extraction_integration=_MockExtractionIntegration(),
            audio_integration=_MockAudioIntegration(),
            transcription_integration=_MockTranscriptionIntegration(),
        )

    app.dependency_overrides[get_extraction_service] = _override_get_extraction_service
    yield
    app.dependency_overrides.pop(get_extraction_service, None)


@pytest.fixture(autouse=True)
def _reset_rate_limiter() -> Iterator[None]:
    quote_api.limiter.reset()
    yield
    quote_api.limiter.reset()


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
    assert extraction_payload["confidence_notes"] == []

    create_response_1 = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "title": "  Front Bed Refresh  ",
            "transcript": extraction_payload["transcript"],
            "line_items": extraction_payload["line_items"],
            "total_amount": extraction_payload["total"],
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
    assert set(list_payload[0].keys()) == {
        "id",
        "customer_id",
        "customer_name",
        "doc_number",
        "title",
        "status",
        "total_amount",
        "item_count",
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


async def test_create_quote_returns_404_for_nonexistent_customer(client: AsyncClient) -> None:
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
    assert [item["description"] for item in payload["line_items"]] == ["Mulch", "Edging"]
    assert [item["price"] for item in payload["line_items"]] == [120, 80]
    assert payload["notes"] == "Updated note only"
    assert payload["total_amount"] == 200


async def test_update_quote_replaces_line_items_when_provided(client: AsyncClient) -> None:
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
            "price": 180,
            "sort_order": 0,
        }
    ]


async def test_business_events_are_logged_for_quote_customer_and_extraction_flows(
    client: AsyncClient,
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

    pdf_response = await client.post(
        f"/api/quotes/{quote_payload['id']}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert pdf_response.status_code == 200

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
    assert emitted_events[3]["detail"] == "notes"
    assert emitted_events[5]["quote_id"] == quote_payload["id"]
    assert emitted_events[7]["quote_id"] == delete_quote_payload["id"]
    assert all(
        "Event Test Customer" not in payload_text
        for payload_text in map(json.dumps, emitted_events)
    )
    assert all(
        "customer@example.com" not in payload_text
        for payload_text in map(json.dumps, emitted_events)
    )


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
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "shared"
    assert payload["share_token"]
    assert len(mock_email_service.messages) == 1
    message = mock_email_service.messages[0]
    assert message.to_email == "alice@example.com"
    assert message.subject == "Quote Q-001 from Summit Exterior Care"
    assert "Summit Exterior Care" in message.html_content
    assert "Jane Doe" in message.html_content
    assert "Q-001" in message.html_content
    assert "$55.00" in message.html_content
    assert f"/doc/{payload['share_token']}" in message.html_content
    assert f"/share/{payload['share_token']}" in message.html_content
    assert "Questions? Call or text +1-555-111-2222." in message.html_content
    assert credentials["email"] in message.html_content
    assert message.reply_to_email == credentials["email"]

    quote_event_names = [
        payload["event"] for payload in emitted_events if payload.get("quote_id") == quote["id"]
    ]
    assert quote_event_names[-2:] == ["quote_shared", "email_sent"]


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
        headers={"X-CSRF-Token": csrf_token},
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
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Generate the PDF before sending this quote by email.",
    }
    assert mock_email_service.messages == []


async def test_send_quote_email_returns_404_for_missing_quote(
    client: AsyncClient,
    mock_email_service: _MockEmailService,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        f"/api/quotes/{uuid4()}/send-email",
        headers={"X-CSRF-Token": csrf_token},
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
        headers={"X-CSRF-Token": csrf_token_user_b},
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
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 429
    assert response.json() == {
        "detail": "This quote was emailed recently. Please wait a few minutes before resending.",
    }
    assert mock_email_service.messages == []


async def test_send_quote_email_returns_429_on_immediate_retry_after_success(
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
        headers={"X-CSRF-Token": csrf_token},
    )
    second_response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 429
    assert second_response.json() == {
        "detail": "This quote was emailed recently. Please wait a few minutes before resending.",
    }
    assert len(mock_email_service.messages) == 1

    user = await _get_user_by_email(db_session, credentials["email"])
    email_sent_count = await db_session.scalar(
        select(func.count())
        .select_from(EventLog)
        .where(
            EventLog.user_id == user.id,
            EventLog.event_name == "email_sent",
            EventLog.metadata_json["quote_id"].as_string() == quote["id"],
        )
    )
    assert email_sent_count == 1


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
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == starting_status.value
    assert len(mock_email_service.messages) == 1
    assert mock_email_service.messages[0].to_email == "customer@example.com"


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

    monkeypatch.setattr(QuoteRepository, "persist_quote_event", _raise_persist_failure)

    first_response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers={"X-CSRF-Token": csrf_token},
    )
    second_response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 429
    assert second_response.json() == {
        "detail": "This quote was emailed recently. Please wait a few minutes before resending.",
    }
    assert len(mock_email_service.messages) == 1


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
        headers={"X-CSRF-Token": csrf_token},
    )
    mock_email_service.raise_send_error = False
    second_response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert first_response.status_code == 502
    assert second_response.status_code == 200
    assert len(mock_email_service.messages) == 1


@pytest.mark.parametrize(
    ("raise_configuration_error", "raise_send_error", "expected_status", "expected_detail"),
    [
        (True, False, 503, "Email delivery is not configured right now."),
        (False, True, 502, "Email delivery failed. Please try again."),
    ],
)
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
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == expected_status
    assert response.json() == {"detail": expected_detail}

    detail_response = await client.get(f"/api/quotes/{quote['id']}")
    assert detail_response.status_code == 200
    assert detail_response.json()["status"] == "shared"


async def test_convert_notes_returns_422_for_extraction_errors(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/convert-notes",
        json={"notes": "malformed extraction response"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422
    assert response.json()["detail"].startswith("Extraction failed:")


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
            "doc_number": "Q-002",
            "title": None,
            "status": "draft",
            "total_amount": 220,
            "item_count": 1,
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


async def test_convert_notes_can_return_flagged_line_items(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/convert-notes",
        json={"notes": "needs-review one board for 9000 dollars"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["line_items"][0]["flagged"] is True
    assert payload["line_items"][0]["flag_reason"]


async def test_capture_audio_single_clip_success(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/capture-audio",
        files=[("clips", ("clip-1.webm", b"clip-a", "audio/webm"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["transcript"] == "transcript from stitched-1"
    assert payload["line_items"]
    assert payload["confidence_notes"] == []


async def test_capture_audio_can_return_flagged_line_items(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/capture-audio",
        files=[("clips", ("clip-1.webm", b"clip-a", "audio/webm"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["line_items"][0]["flagged"] is True
    assert payload["line_items"][0]["flag_reason"]


async def test_capture_audio_multi_clip_success(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/capture-audio",
        files=[
            ("clips", ("clip-1.webm", b"clip-a", "audio/webm")),
            ("clips", ("clip-2.webm", b"clip-b", "audio/webm")),
        ],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    assert response.json()["transcript"] == "transcript from stitched-2"


async def test_capture_audio_missing_clips_field_returns_422(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/capture-audio",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422


async def test_capture_audio_rejects_empty_clip_with_400(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/capture-audio",
        files=[("clips", ("clip-1.webm", b"", "audio/webm"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Audio clip is empty"}


async def test_capture_audio_rejects_unsupported_clip_with_400(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/capture-audio",
        files=[("clips", ("clip-1.webm", b"unsupported", "audio/webm"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Audio clip format is not supported or file is corrupted"}


async def test_capture_audio_rejects_oversized_clip_with_400(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(quote_api, "MAX_AUDIO_CLIP_BYTES", 4)
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/capture-audio",
        files=[("clips", ("clip-1.webm", b"12345", "audio/webm"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Clip too large"}


async def test_capture_audio_transcription_failure_returns_502(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/capture-audio",
        files=[("clips", ("clip-1.webm", b"trigger-transcription-error", "audio/webm"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 502
    assert response.json()["detail"].startswith("Transcription failed:")


async def test_extract_combined_failure_logs_pilot_failure_events_to_stdout(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    emitted_events: list[dict[str, str]] = []

    def _capture(message: str) -> None:
        emitted_events.append(json.loads(message))

    monkeypatch.setattr(event_logger._EVENT_LOGGER, "info", _capture)  # noqa: SLF001

    csrf_token = await _register_and_login(client, _credentials())
    response = await client.post(
        "/api/quotes/extract",
        files=[("clips", ("clip-1.webm", b"trigger-transcription-error", "audio/webm"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 502
    assert [payload["event"] for payload in emitted_events] == [
        "quote_started",
        "audio_uploaded",
        "draft_generation_failed",
    ]
    assert all(payload["detail"] == "audio" for payload in emitted_events)


async def test_extract_combined_notes_only_success(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "add 10 percent travel surcharge"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["transcript"] == "add 10 percent travel surcharge"
    assert payload["line_items"]
    assert payload["confidence_notes"] == []


async def test_extract_combined_clips_only_success(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/extract",
        files=[("clips", ("clip-1.webm", b"clip-a", "audio/webm"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["transcript"] == "transcript from stitched-1"
    assert payload["line_items"][0]["flagged"] is True
    assert payload["line_items"][0]["flag_reason"]


async def test_extract_combined_rejects_empty_clip_with_400(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/extract",
        files=[("clips", ("clip-1.webm", b"", "audio/webm"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Audio clip is empty"}


async def test_extract_combined_clips_and_notes_success(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/extract",
        files=[
            ("clips", ("clip-1.webm", b"clip-a", "audio/webm")),
            ("notes", (None, "add 10 percent travel surcharge")),
        ],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["transcript"] == (
        "transcript from stitched-1\n\nadd 10 percent travel surcharge"
    )
    assert payload["line_items"]
    assert payload["confidence_notes"] == []


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


async def test_extract_combined_requires_clip_or_notes(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, ""))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Provide at least one audio clip or typed notes."}


async def test_extract_combined_rate_limit_returns_429(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(app.state.limiter, "enabled", True)
    csrf_token = await _register_and_login(client, _credentials())

    for index in range(10):
        response = await client.post(
            "/api/quotes/extract",
            files=[("notes", (None, f"note {index}"))],
            headers={"X-CSRF-Token": csrf_token},
        )
        assert response.status_code == 200

    response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "rate limited request"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 429


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("get", "/api/quotes", None),
        ("get", "/api/quotes/00000000-0000-0000-0000-000000000000", None),
        ("post", "/api/quotes/convert-notes", {"notes": "notes"}),
        (
            "post",
            "/api/quotes",
            {
                "customer_id": "00000000-0000-0000-0000-000000000000",
                "transcript": "notes",
                "line_items": [{"description": "x", "details": None, "price": None}],
                "total_amount": None,
                "notes": None,
                "source_type": "text",
            },
        ),
        (
            "patch",
            "/api/quotes/00000000-0000-0000-0000-000000000000",
            {"notes": "updated"},
        ),
        ("delete", "/api/quotes/00000000-0000-0000-0000-000000000000", None),
        ("post", "/api/quotes/00000000-0000-0000-0000-000000000000/pdf", None),
        ("post", "/api/quotes/00000000-0000-0000-0000-000000000000/share", None),
        ("post", "/api/quotes/00000000-0000-0000-0000-000000000000/send-email", None),
        ("post", "/api/quotes/00000000-0000-0000-0000-000000000000/mark-won", None),
        ("post", "/api/quotes/00000000-0000-0000-0000-000000000000/mark-lost", None),
    ],
)
async def test_all_quote_endpoints_require_authentication(
    client: AsyncClient,
    method: str,
    path: str,
    payload: dict[str, object] | None,
) -> None:
    client.cookies.clear()
    client.cookies.set(CSRF_COOKIE_NAME, "csrf", path="/")

    headers = {"X-CSRF-Token": "csrf"}
    request_method = getattr(client, method)
    if payload is None:
        response = await request_method(path, headers=headers)
    else:
        response = await request_method(path, json=payload, headers=headers)

    assert response.status_code == 401


async def test_capture_audio_requires_authentication(client: AsyncClient) -> None:
    client.cookies.clear()
    client.cookies.set(CSRF_COOKIE_NAME, "csrf", path="/")

    response = await client.post(
        "/api/quotes/capture-audio",
        files=[("clips", ("clip-1.webm", b"clip-a", "audio/webm"))],
        headers={"X-CSRF-Token": "csrf"},
    )

    assert response.status_code == 401


async def test_extract_combined_requires_authentication(client: AsyncClient) -> None:
    client.cookies.clear()
    client.cookies.set(CSRF_COOKIE_NAME, "csrf", path="/")

    response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "needs auth"))],
        headers={"X-CSRF-Token": "csrf"},
    )

    assert response.status_code == 401


async def test_convert_notes_requires_csrf(client: AsyncClient) -> None:
    await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/convert-notes",
        json={"notes": "mulch and edging"},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_capture_audio_requires_csrf(client: AsyncClient) -> None:
    await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/capture-audio",
        files=[("clips", ("clip-1.webm", b"clip-a", "audio/webm"))],
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_extract_combined_requires_csrf(client: AsyncClient) -> None:
    await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "mulch and edging"))],
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_create_quote_requires_csrf(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "quote transcript",
            "line_items": [{"description": "line item", "details": None, "price": None}],
            "total_amount": None,
            "notes": None,
            "source_type": "text",
        },
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_patch_quote_requires_csrf(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "quote transcript",
            "line_items": [{"description": "line item", "details": None, "price": None}],
            "total_amount": None,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    quote_id = create_response.json()["id"]

    response = await client.patch(
        f"/api/quotes/{quote_id}",
        json={"notes": "updated"},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_delete_quote_requires_csrf(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "transcript": "quote transcript",
            "line_items": [{"description": "line item", "details": None, "price": None}],
            "total_amount": None,
            "notes": None,
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    quote_id = create_response.json()["id"]

    response = await client.delete(f"/api/quotes/{quote_id}")

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_send_quote_email_requires_csrf(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token, email="customer@example.com")
    quote = await _create_quote(client, csrf_token, customer_id)

    response = await client.post(f"/api/quotes/{quote['id']}/send-email")

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_mark_won_quote_requires_csrf(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200

    response = await client.post(f"/api/quotes/{quote['id']}/mark-won")

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_mark_lost_quote_requires_csrf(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200

    response = await client.post(f"/api/quotes/{quote['id']}/mark-lost")

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


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


async def test_get_quote_returns_404_for_different_users_quote(client: AsyncClient) -> None:
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


async def test_patch_quote_returns_404_for_different_users_quote(client: AsyncClient) -> None:
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
        pdf_response = await client.post(
            f"/api/quotes/{quote_id}/pdf",
            headers={"X-CSRF-Token": csrf_token},
        )
        assert pdf_response.status_code == 200

        detail_response = await client.get(f"/api/quotes/{quote_id}")
        assert detail_response.status_code == 200
        assert detail_response.json()["status"] == "ready"

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


async def test_delete_quote_returns_404_for_different_users_quote(client: AsyncClient) -> None:
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


async def test_patch_ready_quote_reverts_status_to_draft_even_when_values_do_not_change(
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

    pdf_response = await client.post(
        f"/api/quotes/{quote_id}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert pdf_response.status_code == 200

    detail_after_pdf = await client.get(f"/api/quotes/{quote_id}")
    assert detail_after_pdf.status_code == 200
    assert detail_after_pdf.json()["status"] == "ready"

    patch_response = await client.patch(
        f"/api/quotes/{quote_id}",
        json={"notes": "Original note"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert patch_response.status_code == 200
    assert patch_response.json()["status"] == "draft"
    assert patch_response.json()["notes"] == "Original note"


async def test_patch_shared_quote_returns_409(client: AsyncClient) -> None:
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

    patch_response = await client.patch(
        f"/api/quotes/{quote_id}",
        json={"notes": "Updated note"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert patch_response.status_code == 409
    assert patch_response.json() == {"detail": "Shared quotes cannot be edited"}


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
    ("starting_status", "endpoint", "expected_status", "expected_event"),
    [
        (QuoteStatus.SHARED, "mark-won", "approved", "quote_approved"),
        (QuoteStatus.VIEWED, "mark-won", "approved", "quote_approved"),
        (QuoteStatus.SHARED, "mark-lost", "declined", "quote_marked_lost"),
        (QuoteStatus.VIEWED, "mark-lost", "declined", "quote_marked_lost"),
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

    share_response = await client.post(
        f"/api/quotes/{quote_id}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200

    if starting_status is not QuoteStatus.SHARED:
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
        "doc_number",
        "title",
        "status",
        "source_type",
        "transcript",
        "total_amount",
        "notes",
        "shared_at",
        "share_token",
        "line_items",
        "created_at",
        "updated_at",
    }
    assert expected_event in event_logger._PILOT_EVENT_NAMES  # noqa: SLF001
    assert [event["event"] for event in emitted_events][-1] == expected_event


@pytest.mark.parametrize("endpoint", ["mark-won", "mark-lost"])
@pytest.mark.parametrize("starting_status", [QuoteStatus.DRAFT, QuoteStatus.READY])
async def test_mark_quote_outcome_returns_409_when_quote_not_shared_yet(
    client: AsyncClient,
    db_session: AsyncSession,
    starting_status: QuoteStatus,
    endpoint: str,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)
    quote_id = quote["id"]

    if starting_status is QuoteStatus.READY:
        pdf_response = await client.post(
            f"/api/quotes/{quote_id}/pdf",
            headers={"X-CSRF-Token": csrf_token},
        )
        assert pdf_response.status_code == 200
    else:
        await _set_quote_status(db_session, quote_id, starting_status)

    response = await client.post(
        f"/api/quotes/{quote_id}/{endpoint}",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "Quote has not been shared yet"}


@pytest.mark.parametrize("endpoint", ["mark-won", "mark-lost"])
@pytest.mark.parametrize("starting_status", [QuoteStatus.APPROVED, QuoteStatus.DECLINED])
async def test_mark_quote_outcome_returns_409_when_already_recorded(
    client: AsyncClient,
    db_session: AsyncSession,
    starting_status: QuoteStatus,
    endpoint: str,
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
    await _set_quote_status(db_session, quote_id, starting_status)

    response = await client.post(
        f"/api/quotes/{quote_id}/{endpoint}",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "Quote outcome has already been recorded"}


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
    assert response.json() == {"detail": "Quote outcome has already been recorded"}


@pytest.mark.parametrize(
    "status",
    [QuoteStatus.VIEWED, QuoteStatus.APPROVED, QuoteStatus.DECLINED],
)
async def test_patch_non_editable_quote_statuses_return_409(
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

    patch_response = await client.patch(
        f"/api/quotes/{quote_id}",
        json={"notes": "Updated note"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert patch_response.status_code == 409
    assert patch_response.json() == {"detail": "Shared quotes cannot be edited"}


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


async def _register_and_login(client: AsyncClient, credentials: dict[str, str]) -> str:
    register_response = await client.post("/api/auth/register", json=credentials)
    assert register_response.status_code == 201
    login_response = await client.post("/api/auth/login", json=credentials)
    assert login_response.status_code == 200
    csrf_token = client.cookies.get(CSRF_COOKIE_NAME)
    assert csrf_token is not None
    return csrf_token


async def _create_customer(
    client: AsyncClient,
    csrf_token: str,
    *,
    name: str = "Quote Test Customer",
    email: str | None = None,
    phone: str | None = None,
    address: str | None = None,
) -> str:
    response = await client.post(
        "/api/customers",
        json={
            "name": name,
            "email": email,
            "phone": phone,
            "address": address,
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert response.status_code == 201
    return response.json()["id"]


async def _create_quote(client: AsyncClient, csrf_token: str, customer_id: str) -> dict[str, str]:
    response = await client.post(
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
    assert response.status_code == 201
    return response.json()


async def _set_profile_for_email_delivery(client: AsyncClient, csrf_token: str) -> None:
    response = await client.patch(
        "/api/profile",
        json={
            "business_name": "Summit Exterior Care",
            "first_name": "Jane",
            "last_name": "Doe",
            "trade_type": "Landscaper",
            "timezone": "America/New_York",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert response.status_code == 200


async def _set_user_phone_number(
    db_session: AsyncSession,
    *,
    email: str,
    phone_number: str,
) -> None:
    user = await _get_user_by_email(db_session, email)
    user.phone_number = phone_number
    await db_session.commit()


async def _get_user_by_email(db_session: AsyncSession, email: str) -> User:
    user = await db_session.scalar(select(User).where(User.email == email))
    assert user is not None
    return user


async def _set_quote_status(
    db_session: AsyncSession,
    quote_id: str,
    status: QuoteStatus,
) -> None:
    quote = await db_session.scalar(select(Document).where(Document.id == UUID(quote_id)))
    assert quote is not None
    quote.status = status
    await db_session.commit()


def _credentials() -> dict[str, str]:
    suffix = uuid4().hex[:12]
    return {
        "email": f"user-{suffix}@example.com",
        "password": "StrongPass123!",
    }
