"""Quote API behavior tests for extraction, CRUD flow, and ownership scoping."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Iterator, Sequence
from datetime import date
from types import SimpleNamespace
from typing import Annotated
from uuid import UUID, uuid4

import pytest
from fastapi import Depends
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.features.auth.models import User
from app.features.auth.service import CSRF_COOKIE_NAME
from app.features.event_logs.models import EventLog
from app.features.invoices import (
    email_delivery_service as invoice_email_delivery_service,
)
from app.features.invoices.repository import InvoiceRepository
from app.features.jobs.models import JobRecord, JobStatus, JobType
from app.features.jobs.repository import JobRepository
from app.features.quotes import api as quote_api
from app.features.quotes import email_delivery_service
from app.features.quotes.extraction_service import ExtractionService
from app.features.quotes.models import Document, LineItem, QuoteStatus
from app.features.quotes.repository import QuoteRenderContext, QuoteRepository
from app.features.quotes.schemas import ExtractionResult, LineItemExtracted
from app.features.quotes.service import QuoteService
from app.integrations.audio import AudioClip, AudioError
from app.integrations.email import EmailConfigurationError, EmailMessage, EmailSendError
from app.integrations.extraction import ExtractionError
from app.integrations.storage import StorageNotFoundError
from app.integrations.transcription import TranscriptionError
from app.main import app
from app.shared import event_logger
from app.shared.dependencies import (
    get_email_service,
    get_extraction_service,
    get_idempotency_store,
    get_quote_service,
    get_storage_service,
)
from app.shared.idempotency import IdempotencyBeginResult
from app.shared.input_limits import (
    CUSTOMER_ADDRESS_MAX_CHARS,
    DOCUMENT_LINE_ITEMS_MAX_ITEMS,
    DOCUMENT_NOTES_MAX_CHARS,
    DOCUMENT_TRANSCRIPT_MAX_CHARS,
    LINE_ITEM_DESCRIPTION_MAX_CHARS,
    LINE_ITEM_DETAILS_MAX_CHARS,
    MAX_AUDIO_CLIPS_PER_REQUEST,
    NOTE_INPUT_MAX_CHARS,
)
from app.shared.rate_limit import reset_local_rate_limit_state

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _reset_email_delivery_fallback_cache() -> Iterator[None]:
    email_delivery_service._EMAIL_SENT_FALLBACK_TIMESTAMPS.clear()  # noqa: SLF001
    invoice_email_delivery_service._EMAIL_SENT_FALLBACK_TIMESTAMPS.clear()  # noqa: SLF001
    yield
    email_delivery_service._EMAIL_SENT_FALLBACK_TIMESTAMPS.clear()  # noqa: SLF001
    invoice_email_delivery_service._EMAIL_SENT_FALLBACK_TIMESTAMPS.clear()  # noqa: SLF001


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


class _FailingAbortIdempotencyStore:
    async def begin(self, **_: object) -> IdempotencyBeginResult:
        return IdempotencyBeginResult(kind="started")

    async def abort(self, **_: object) -> None:
        raise RuntimeError("redis unavailable")

    async def complete(self, **_: object) -> None:
        return None


class _InProgressIdempotencyStore:
    async def begin(self, **_: object) -> IdempotencyBeginResult:
        return IdempotencyBeginResult(kind="in_progress")

    async def abort(self, **_: object) -> None:
        return None

    async def complete(self, **_: object) -> None:
        return None


class _MockArqPool:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    async def enqueue_job(self, function: str, *args: object, **kwargs: object) -> object:
        self.calls.append(
            {
                "function": function,
                "args": args,
                "kwargs": kwargs,
            }
        )
        return SimpleNamespace(job_id=kwargs.get("_job_id"))


class _FailingArqPool:
    async def enqueue_job(self, function: str, *args: object, **kwargs: object) -> object:
        del function
        del args
        del kwargs
        raise RuntimeError("redis unavailable")


def _send_email_headers(csrf_token: str, *, idempotency_key: str | None = None) -> dict[str, str]:
    return {
        "X-CSRF-Token": csrf_token,
        "Idempotency-Key": idempotency_key or uuid4().hex,
    }


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
    reset_local_rate_limit_state()
    yield
    reset_local_rate_limit_state()


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
            "price": 180,
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
        headers=_send_email_headers(csrf_token),
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
    assert "Questions? Call or text +1-555-111-2222." in message.text_content
    assert f"Reply to: {credentials['email']}" in message.text_content
    assert message.reply_to_email == credentials["email"]

    quote_event_names = [
        payload["event"] for payload in emitted_events if payload.get("quote_id") == quote["id"]
    ]
    assert quote_event_names[-2:] == ["quote_shared", "email_sent"]


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

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert second_response.headers["Idempotency-Replayed"] == "true"
    assert second_response.json() == first_response.json()
    assert len(mock_email_service.messages) == 1


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

    assert response.status_code == 200
    assert len(mock_email_service.messages) == 1
    message = mock_email_service.messages[0]
    assert "Questions? Reply to this email." in message.html_content
    assert "Questions? Reply to this email." in message.text_content
    assert "Questions? Call or text" not in message.html_content
    assert "Questions? Call or text" not in message.text_content
    assert credentials["email"] in message.html_content
    assert f"Reply to: {credentials['email']}" in message.text_content
    assert message.reply_to_email == credentials["email"]


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

    assert response.status_code == 200
    assert len(mock_email_service.messages) == 1
    message = mock_email_service.messages[0]
    assert "Questions? Contact your contractor for help." in message.html_content
    assert "Questions? Contact your contractor for help." in message.text_content
    assert "Questions? Call or text" not in message.html_content
    assert "Questions? Call or text" not in message.text_content
    assert "Reply to this email." not in message.html_content
    assert "Reply to this email." not in message.text_content
    assert "Reply to " not in message.html_content
    assert "Reply to:" not in message.text_content
    assert message.reply_to_email is None


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
    original_share_token = share_response.json()["share_token"]

    await _set_quote_status(db_session, quote["id"], terminal_status)

    response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers=_send_email_headers(csrf_token),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == terminal_status.value
    assert payload["share_token"] == original_share_token
    assert len(mock_email_service.messages) == 1


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
        headers=_send_email_headers(csrf_token, idempotency_key="quote-send-1"),
    )
    second_response = await client.post(
        f"/api/quotes/{quote['id']}/send-email",
        headers=_send_email_headers(csrf_token, idempotency_key="quote-send-2"),
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

    assert first_response.status_code == 200
    assert second_response.status_code == 429
    assert "Rate limit exceeded" in second_response.json()["error"]
    assert len(mock_email_service.messages) == 1


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

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "sent"
    assert payload["share_token"]
    assert len(mock_email_service.messages) == 1
    message = mock_email_service.messages[0]
    assert message.to_email == "alice@example.com"
    assert message.subject == "Invoice I-001 from Summit Exterior Care"
    assert "Summit Exterior Care" in message.html_content
    assert "Jane Doe" in message.html_content
    assert "I-001" in message.html_content
    assert "$55.00" in message.html_content
    assert _format_human_date(invoice["due_date"]) in message.html_content
    assert f"/share/{payload['share_token']}" in message.html_content
    assert "View Invoice PDF" in message.html_content
    assert "Questions? Call or text +1-555-111-2222." in message.html_content
    assert credentials["email"] in message.html_content
    assert "Questions? Call or text +1-555-111-2222." in message.text_content
    assert f"Reply to: {credentials['email']}" in message.text_content
    assert message.reply_to_email == credentials["email"]

    user = await _get_user_by_email(db_session, credentials["email"])
    email_sent_count = await db_session.scalar(
        select(func.count())
        .select_from(EventLog)
        .where(
            EventLog.user_id == user.id,
            EventLog.event_name == "email_sent",
            EventLog.metadata_json["invoice_id"].as_string() == invoice["id"],
        )
    )
    assert email_sent_count == 1


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

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert second_response.headers["Idempotency-Replayed"] == "true"
    assert second_response.json() == first_response.json()
    assert len(mock_email_service.messages) == 1


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

    assert first_response.status_code == 200
    assert second_response.status_code == 409
    assert second_response.json() == {
        "detail": "Idempotency key was already used for a different request.",
    }
    assert len(mock_email_service.messages) == 1


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

    assert first_response.status_code == 200
    assert second_response.status_code == 429
    assert "Rate limit exceeded" in second_response.json()["error"]
    assert len(mock_email_service.messages) == 1


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
    original_share_token = share_response.json()["share_token"]

    response = await client.post(
        f"/api/invoices/{invoice['id']}/send-email",
        headers=_send_email_headers(csrf_token),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "sent"
    assert payload["share_token"] == original_share_token
    assert len(mock_email_service.messages) == 1


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
        "detail": "This invoice was emailed recently. Please wait a few minutes before resending.",
    }
    assert mock_email_service.messages == []


async def test_send_invoice_email_returns_429_on_immediate_retry_after_success(
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

    assert first_response.status_code == 200
    assert second_response.status_code == 429
    assert second_response.json() == {
        "detail": "This invoice was emailed recently. Please wait a few minutes before resending.",
    }
    assert len(mock_email_service.messages) == 1


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
        "detail": "This invoice was emailed recently. Please wait a few minutes before resending.",
    }
    assert len(mock_email_service.messages) == 1
    assert rollback_calls == 1


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


async def test_convert_notes_returns_422_for_extraction_errors(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/convert-notes",
        json={"notes": "malformed extraction response"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422
    assert response.json()["detail"].startswith("Extraction failed:")


async def test_convert_notes_rejects_notes_over_limit(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/convert-notes",
        json={"notes": "x" * (NOTE_INPUT_MAX_CHARS + 1)},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422


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


async def test_create_direct_invoice_rejects_transcript_over_limit(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    response = await client.post(
        "/api/invoices",
        json={
            "customer_id": customer_id,
            "transcript": "x" * (DOCUMENT_TRANSCRIPT_MAX_CHARS + 1),
            "line_items": [{"description": "line item", "details": None, "price": 55}],
            "total_amount": 55,
            "notes": "Original note",
            "source_type": "text",
        },
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


async def test_capture_audio_rejects_too_many_clips(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/capture-audio",
        files=[
            ("clips", (f"clip-{index}.webm", b"x", "audio/webm"))
            for index in range(MAX_AUDIO_CLIPS_PER_REQUEST + 1)
        ],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 400
    assert response.json() == {
        "detail": f"No more than {MAX_AUDIO_CLIPS_PER_REQUEST} audio clips are allowed"
    }


async def test_capture_audio_missing_clips_field_returns_422(
    client: AsyncClient,
) -> None:
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


async def test_capture_audio_rejects_unsupported_clip_with_400(
    client: AsyncClient,
) -> None:
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


async def test_capture_audio_rejects_total_upload_limit(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(quote_api, "MAX_AUDIO_TOTAL_BYTES", 4)
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/capture-audio",
        files=[
            ("clips", ("clip-1.webm", b"123", "audio/webm")),
            ("clips", ("clip-2.webm", b"456", "audio/webm")),
        ],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Total audio upload too large"}


async def test_capture_audio_transcription_failure_returns_502(
    client: AsyncClient,
) -> None:
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


async def test_extract_combined_falls_back_to_sync_when_no_arq_pool_is_available(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    app.state.arq_pool = None

    response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "mulch the front beds"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    job_count = await db_session.scalar(select(func.count(JobRecord.id)))

    assert response.status_code == 200
    assert response.json()["transcript"] == "mulch the front beds"
    assert int(job_count or 0) == 0


async def test_extract_combined_enqueues_async_job_when_arq_pool_is_available(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    pool = _MockArqPool()
    app.state.arq_pool = pool

    response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "mulch the front beds"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    jobs = (await db_session.scalars(select(JobRecord))).all()

    assert response.status_code == 202
    payload = response.json()
    assert payload["job_type"] == "extraction"
    assert payload["status"] == "pending"
    assert payload["extraction_result"] is None
    assert len(jobs) == 1
    assert jobs[0].status == JobStatus.PENDING
    assert pool.calls == [
        {
            "function": "jobs.extraction",
            "args": (str(jobs[0].id),),
            "kwargs": {
                "_job_id": str(jobs[0].id),
                "transcript": "mulch the front beds",
            },
        }
    ]


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


async def test_extract_combined_rejects_empty_clip_with_400(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/extract",
        files=[("clips", ("clip-1.webm", b"", "audio/webm"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Audio clip is empty"}


async def test_extract_combined_rejects_unsupported_content_type_before_processing(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/extract",
        files=[("clips", ("clip-1.txt", b"not-audio", "text/plain"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Audio clip content type is not supported"}


async def test_extract_combined_rejects_notes_over_limit(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "x" * (NOTE_INPUT_MAX_CHARS + 1)))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422


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


async def test_extract_combined_rejects_when_async_job_limit_is_exhausted(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    credentials = _credentials()
    csrf_token = await _register_and_login(client, credentials)
    app.state.arq_pool = _MockArqPool()
    monkeypatch.setenv("EXTRACTION_CONCURRENCY_LIMIT", "1")
    get_settings.cache_clear()

    user = await _get_user_by_email(db_session, credentials["email"])
    repository = JobRepository(db_session)
    await repository.create(user_id=user.id, job_type=JobType.EXTRACTION)
    await db_session.commit()

    response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "mulch the front beds"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 429
    assert response.json() == {
        "detail": "Extraction quota or concurrency exhausted. Please retry later."
    }


async def test_extract_combined_marks_pending_job_terminal_when_enqueue_fails(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    app.state.arq_pool = _FailingArqPool()

    response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "mulch the front beds"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    jobs = (await db_session.scalars(select(JobRecord))).all()

    assert response.status_code == 503
    assert response.json() == {"detail": "Unable to start extraction right now. Please try again."}
    assert len(jobs) == 1
    assert jobs[0].status == JobStatus.TERMINAL
    assert jobs[0].terminal_error == "enqueue_failed"


async def test_convert_notes_rate_limit_is_keyed_by_user_not_ip(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(app.state.limiter, "enabled", True)
    monkeypatch.setenv("QUOTE_TEXT_EXTRACTION_RATE_LIMIT", "1/minute")
    get_settings.cache_clear()

    csrf_token_user_one = await _register_and_login(client, _credentials())
    first_response = await client.post(
        "/api/quotes/convert-notes",
        json={"notes": "mulch the side yard"},
        headers={"X-CSRF-Token": csrf_token_user_one},
    )
    assert first_response.status_code == 200

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as second_client:
        csrf_token_user_two = await _register_and_login(
            second_client,
            _credentials(),
        )
        second_response = await second_client.post(
            "/api/quotes/convert-notes",
            json={"notes": "edge the front beds"},
            headers={"X-CSRF-Token": csrf_token_user_two},
        )
        assert second_response.status_code == 200

    blocked_response = await client.post(
        "/api/quotes/convert-notes",
        json={"notes": "rate limited request"},
        headers={"X-CSRF-Token": csrf_token_user_one},
    )

    assert blocked_response.status_code == 429


async def test_convert_notes_rejects_when_daily_quota_is_exhausted(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(app.state.limiter, "enabled", True)
    monkeypatch.setenv("EXTRACTION_DAILY_QUOTA", "1")
    monkeypatch.setenv("REDIS_KEY_PREFIX", f"test-daily-quota-{uuid4()}")
    get_settings.cache_clear()
    csrf_token = await _register_and_login(client, _credentials())

    first_response = await client.post(
        "/api/quotes/convert-notes",
        json={"notes": "mulch the side yard"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert first_response.status_code == 200

    second_response = await client.post(
        "/api/quotes/convert-notes",
        json={"notes": "edge the front beds"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert second_response.status_code == 429
    assert second_response.json() == {
        "detail": "Extraction quota or concurrency exhausted. Please retry later."
    }


async def test_convert_notes_rejects_when_concurrency_limit_is_exhausted(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _BlockingExtractionIntegration:
        def __init__(self) -> None:
            self.started = asyncio.Event()
            self.release = asyncio.Event()

        async def extract(self, notes: str) -> ExtractionResult:
            self.started.set()
            await self.release.wait()
            return ExtractionResult(
                transcript=notes,
                line_items=[],
                total=None,
                confidence_notes=[],
            )

    blocking_integration = _BlockingExtractionIntegration()

    async def _override_get_extraction_service() -> ExtractionService:
        return ExtractionService(
            extraction_integration=blocking_integration,
            audio_integration=_MockAudioIntegration(),
            transcription_integration=_MockTranscriptionIntegration(),
        )

    app.dependency_overrides[get_extraction_service] = _override_get_extraction_service
    monkeypatch.setattr(app.state.limiter, "enabled", True)
    monkeypatch.setenv("EXTRACTION_CONCURRENCY_LIMIT", "1")
    monkeypatch.setenv("REDIS_KEY_PREFIX", f"test-concurrency-{uuid4()}")
    get_settings.cache_clear()
    csrf_token = await _register_and_login(client, _credentials())

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as second_client:
        second_client.cookies.update(client.cookies)
        first_request = asyncio.create_task(
            client.post(
                "/api/quotes/convert-notes",
                json={"notes": "mulch the side yard"},
                headers={"X-CSRF-Token": csrf_token},
            )
        )
        await blocking_integration.started.wait()

        blocked_response = await second_client.post(
            "/api/quotes/convert-notes",
            json={"notes": "edge the front beds"},
            headers={"X-CSRF-Token": csrf_token},
        )

        blocking_integration.release.set()
        first_response = await first_request

    assert first_response.status_code == 200
    assert blocked_response.status_code == 429
    assert blocked_response.json() == {
        "detail": "Extraction quota or concurrency exhausted. Please retry later."
    }


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


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        (
            "post",
            "/api/invoices",
            {
                "customer_id": "00000000-0000-0000-0000-000000000000",
                "transcript": "notes",
                "line_items": [{"description": "x", "details": None, "price": None}],
                "total_amount": None,
                "notes": None,
                "source_type": "text",
            },
        ),
        ("get", "/api/invoices/00000000-0000-0000-0000-000000000000", None),
        (
            "patch",
            "/api/invoices/00000000-0000-0000-0000-000000000000",
            {"due_date": "2026-05-01"},
        ),
        ("post", "/api/invoices/00000000-0000-0000-0000-000000000000/pdf", None),
        ("post", "/api/invoices/00000000-0000-0000-0000-000000000000/share", None),
        ("post", "/api/invoices/00000000-0000-0000-0000-000000000000/send-email", None),
    ],
)
async def test_all_invoice_endpoints_require_authentication(
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


@pytest.mark.parametrize(
    ("method", "path_suffix", "payload"),
    [
        ("patch", "", {"due_date": "2026-05-01"}),
        ("post", "/pdf", None),
        ("post", "/share", None),
        ("post", "/send-email", None),
    ],
)
async def test_invoice_mutations_require_csrf(
    client: AsyncClient,
    db_session: AsyncSession,
    method: str,
    path_suffix: str,
    payload: dict[str, object] | None,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    invoice = await _create_approved_invoice(client, csrf_token, db_session)

    request_method = getattr(client, method)
    if payload is None:
        response = await request_method(f"/api/invoices/{invoice['id']}{path_suffix}")
    else:
        response = await request_method(
            f"/api/invoices/{invoice['id']}{path_suffix}",
            json=payload,
        )

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_create_invoice_requires_csrf(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    response = await client.post(
        "/api/invoices",
        json={
            "customer_id": customer_id,
            "transcript": "invoice transcript",
            "line_items": [{"description": "line item", "details": None, "price": 55}],
            "total_amount": 55,
            "notes": None,
            "source_type": "text",
        },
    )

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


async def test_create_invoice_returns_404_for_different_users_customer(
    client: AsyncClient,
) -> None:
    csrf_token_user_a = await _register_and_login(client, _credentials())
    customer_id_user_a = await _create_customer(client, csrf_token_user_a)

    csrf_token_user_b = await _register_and_login(client, _credentials())
    response = await client.post(
        "/api/invoices",
        json={
            "customer_id": customer_id_user_a,
            "transcript": "invoice transcript",
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
        pdf_response = await client.post(
            f"/api/quotes/{quote_id}/pdf",
            headers={"X-CSRF-Token": csrf_token},
        )
        assert pdf_response.status_code == 200
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
    "starting_status",
    [
        QuoteStatus.DRAFT,
        QuoteStatus.READY,
        QuoteStatus.SHARED,
        QuoteStatus.VIEWED,
        QuoteStatus.APPROVED,
        QuoteStatus.DECLINED,
    ],
)
async def test_convert_quote_to_invoice_creates_linked_invoice_and_keeps_quote_list_clean(
    client: AsyncClient,
    db_session: AsyncSession,
    starting_status: QuoteStatus,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(
        client,
        csrf_token,
        email="customer@example.com",
        phone="+1-555-123-4567",
    )
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
        pdf_response = await client.post(
            f"/api/quotes/{quote_id}/pdf",
            headers={"X-CSRF-Token": csrf_token},
        )
        assert pdf_response.status_code == 200
    elif starting_status is not QuoteStatus.DRAFT and starting_status is not QuoteStatus.SHARED:
        await _set_quote_status(db_session, quote_id, starting_status)

    convert_response = await client.post(
        f"/api/quotes/{quote_id}/convert-to-invoice",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert convert_response.status_code == 201
    invoice_payload = convert_response.json()
    assert invoice_payload["doc_number"] == "I-001"
    assert invoice_payload["status"] == "draft"
    assert invoice_payload["source_document_id"] == quote_id
    assert invoice_payload["due_date"] is not None

    quote_detail_response = await client.get(f"/api/quotes/{quote_id}")
    assert quote_detail_response.status_code == 200
    quote_detail = quote_detail_response.json()
    assert quote_detail["linked_invoice"] == {
        "id": invoice_payload["id"],
        "doc_number": "I-001",
        "status": "draft",
        "due_date": invoice_payload["due_date"],
        "total_amount": 55.0,
        "created_at": invoice_payload["created_at"],
    }

    invoice_detail_response = await client.get(f"/api/invoices/{invoice_payload['id']}")
    assert invoice_detail_response.status_code == 200
    invoice_detail = invoice_detail_response.json()
    assert invoice_detail["source_quote_number"] == "Q-001"
    assert invoice_detail["customer"] == {
        "id": customer_id,
        "name": "Quote Test Customer",
        "email": "customer@example.com",
        "phone": "+1-555-123-4567",
    }

    list_response = await client.get("/api/quotes")
    assert list_response.status_code == 200
    list_payload = list_response.json()
    assert len(list_payload) == 1
    assert list_payload[0]["id"] == quote_id

    invoice_count = await db_session.scalar(
        select(func.count()).select_from(Document).where(Document.doc_type == "invoice")
    )
    assert invoice_count == 1


async def test_optional_pricing_persists_on_quotes_public_payloads_and_converted_invoices(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/quotes",
        json={
            "customer_id": customer_id,
            "title": "Priced quote",
            "transcript": "quote transcript",
            "line_items": [{"description": "line item", "details": None, "price": 120}],
            "total_amount": 120,
            "discount_type": "fixed",
            "discount_value": 10,
            "tax_rate": 0.1,
            "deposit_amount": 30,
            "notes": "Original note",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert create_response.status_code == 201
    quote_payload = create_response.json()
    assert quote_payload["total_amount"] == 121
    assert quote_payload["discount_type"] == "fixed"
    assert quote_payload["discount_value"] == 10
    assert quote_payload["tax_rate"] == 0.1
    assert quote_payload["deposit_amount"] == 30

    quote_id = quote_payload["id"]
    quote_detail_response = await client.get(f"/api/quotes/{quote_id}")
    assert quote_detail_response.status_code == 200
    assert quote_detail_response.json()["total_amount"] == 121

    share_response = await client.post(
        f"/api/quotes/{quote_id}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]
    assert share_token is not None

    public_response = await client.get(f"/api/public/doc/{share_token}")
    assert public_response.status_code == 200
    assert public_response.json()["discount_type"] == "fixed"
    assert public_response.json()["discount_value"] == 10
    assert public_response.json()["tax_rate"] == 0.1
    assert public_response.json()["deposit_amount"] == 30

    await _set_quote_status(db_session, quote_id, QuoteStatus.APPROVED)
    convert_response = await client.post(
        f"/api/quotes/{quote_id}/convert-to-invoice",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert convert_response.status_code == 201
    invoice_payload = convert_response.json()
    assert invoice_payload["total_amount"] == 121
    assert invoice_payload["discount_type"] == "fixed"
    assert invoice_payload["discount_value"] == 10
    assert invoice_payload["tax_rate"] == 0.1
    assert invoice_payload["deposit_amount"] == 30


async def test_create_direct_invoice_sets_default_due_date_and_keeps_quote_list_clean(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(
        client,
        csrf_token,
        email="customer@example.com",
        phone="+1-555-123-4567",
    )

    create_response = await client.post(
        "/api/invoices",
        json={
            "customer_id": customer_id,
            "title": "  Front Bed Refresh  ",
            "transcript": "invoice transcript",
            "line_items": [{"description": "line item", "details": None, "price": 55}],
            "total_amount": 55,
            "notes": "Original note",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert create_response.status_code == 201
    invoice_payload = create_response.json()
    assert invoice_payload["doc_number"] == "I-001"
    assert invoice_payload["status"] == "draft"
    assert invoice_payload["title"] == "Front Bed Refresh"
    assert invoice_payload["source_document_id"] is None
    assert invoice_payload["due_date"] is not None

    invoice_detail_response = await client.get(f"/api/invoices/{invoice_payload['id']}")
    assert invoice_detail_response.status_code == 200
    invoice_detail = invoice_detail_response.json()
    assert invoice_detail["source_document_id"] is None
    assert invoice_detail["source_quote_number"] is None
    assert invoice_detail["customer"] == {
        "id": customer_id,
        "name": "Quote Test Customer",
        "email": "customer@example.com",
        "phone": "+1-555-123-4567",
    }

    list_response = await client.get("/api/quotes")
    assert list_response.status_code == 200
    assert list_response.json() == []

    quote_count = await db_session.scalar(
        select(func.count()).select_from(Document).where(Document.doc_type == "quote")
    )
    invoice_count = await db_session.scalar(
        select(func.count()).select_from(Document).where(Document.doc_type == "invoice")
    )
    assert quote_count == 0
    assert invoice_count == 1


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


async def test_list_invoices_returns_direct_and_quote_derived_summaries_newest_first(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    quote_customer_id = await _create_customer(client, csrf_token, name="Quote Customer")
    direct_customer_id = await _create_customer(client, csrf_token, name="Direct Customer")

    quote = await _create_quote(client, csrf_token, quote_customer_id)
    await _set_quote_status(db_session, quote["id"], QuoteStatus.APPROVED)
    linked_invoice_response = await client.post(
        f"/api/quotes/{quote['id']}/convert-to-invoice",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert linked_invoice_response.status_code == 201
    linked_invoice = linked_invoice_response.json()

    direct_invoice = await _create_direct_invoice(
        client,
        csrf_token,
        direct_customer_id,
        title="Direct invoice",
        transcript="direct invoice transcript",
        total_amount=220,
    )

    response = await client.get("/api/invoices")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": direct_invoice["id"],
            "customer_id": direct_customer_id,
            "customer_name": "Direct Customer",
            "doc_number": "I-002",
            "title": "Direct invoice",
            "status": "draft",
            "total_amount": 220,
            "due_date": direct_invoice["due_date"],
            "created_at": direct_invoice["created_at"],
            "source_document_id": None,
        },
        {
            "id": linked_invoice["id"],
            "customer_id": quote_customer_id,
            "customer_name": "Quote Customer",
            "doc_number": "I-001",
            "title": None,
            "status": "draft",
            "total_amount": 55,
            "due_date": linked_invoice["due_date"],
            "created_at": linked_invoice["created_at"],
            "source_document_id": quote["id"],
        },
    ]


async def test_list_invoices_can_filter_by_customer_id(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id_a = await _create_customer(client, csrf_token, name="Customer A")
    customer_id_b = await _create_customer(client, csrf_token, name="Customer B")

    await _create_direct_invoice(
        client,
        csrf_token,
        customer_id_a,
        title="Invoice for A",
        transcript="invoice for customer a",
        total_amount=120,
    )
    invoice_b = await _create_direct_invoice(
        client,
        csrf_token,
        customer_id_b,
        title="Invoice for B",
        transcript="invoice for customer b",
        total_amount=220,
    )

    response = await client.get(f"/api/invoices?customer_id={customer_id_b}")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": invoice_b["id"],
            "customer_id": customer_id_b,
            "customer_name": "Customer B",
            "doc_number": "I-002",
            "title": "Invoice for B",
            "status": "draft",
            "total_amount": 220,
            "due_date": invoice_b["due_date"],
            "created_at": invoice_b["created_at"],
            "source_document_id": None,
        }
    ]


async def test_invoice_patch_preserves_omitted_fields_and_ready_status_for_direct_invoice(
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

    preview_response = await client.post(
        f"/api/invoices/{invoice_id}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert preview_response.status_code == 200

    patch_response = await client.patch(
        f"/api/invoices/{invoice_id}",
        json={"notes": "Updated note only"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert patch_response.status_code == 200
    patched_invoice = patch_response.json()
    assert patched_invoice["status"] == "ready"
    assert patched_invoice["title"] == "Direct invoice"
    assert patched_invoice["notes"] == "Updated note only"
    assert patched_invoice["due_date"] == direct_invoice["due_date"]
    assert patched_invoice["total_amount"] == 220
    assert patched_invoice["line_items"] == direct_invoice["line_items"]
    assert patched_invoice["share_token"] is None
    assert patched_invoice["shared_at"] is None


async def test_invoice_patch_rejects_invalid_optional_pricing_without_partial_write(
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
        total_amount=120,
    )
    invoice_id = direct_invoice["id"]

    patch_response = await client.patch(
        f"/api/invoices/{invoice_id}",
        json={"tax_rate": 1.25},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert patch_response.status_code == 422
    assert patch_response.json() == {"detail": "Tax rate must be between 0 and 1"}

    invoice_detail_response = await client.get(f"/api/invoices/{invoice_id}")
    assert invoice_detail_response.status_code == 200
    assert invoice_detail_response.json()["tax_rate"] is None
    assert invoice_detail_response.json()["discount_type"] is None


async def test_invoice_patch_recomputes_priced_total_when_line_items_change_without_subtotal_patch(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/invoices",
        json={
            "customer_id": customer_id,
            "title": "Direct invoice",
            "transcript": "direct invoice transcript",
            "line_items": [{"description": "line item", "details": None, "price": 100}],
            "total_amount": 100,
            "discount_type": "fixed",
            "discount_value": 10,
            "tax_rate": 0.1,
            "notes": "Original note",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    invoice_id = create_response.json()["id"]

    patch_response = await client.patch(
        f"/api/invoices/{invoice_id}",
        json={
            "line_items": [
                {"description": "updated line item", "details": None, "price": 200},
            ]
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert patch_response.status_code == 200
    patched_invoice = patch_response.json()
    assert patched_invoice["total_amount"] == 209
    assert patched_invoice["discount_type"] == "fixed"
    assert patched_invoice["discount_value"] == 10
    assert patched_invoice["tax_rate"] == 0.1

    invoice_detail_response = await client.get(f"/api/invoices/{invoice_id}")
    assert invoice_detail_response.status_code == 200
    assert invoice_detail_response.json()["deposit_amount"] is None
    assert invoice_detail_response.json()["total_amount"] == 209


async def test_invoice_patch_deposit_only_preserves_total_and_stores_deposit(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/invoices",
        json={
            "customer_id": customer_id,
            "title": "Direct invoice",
            "transcript": "direct invoice transcript",
            "line_items": [{"description": "Work", "details": None, "price": 100}],
            "total_amount": 100,
            "discount_type": "fixed",
            "discount_value": 10,
            "tax_rate": 0.1,
            "notes": "Original note",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    invoice_id = create_response.json()["id"]
    expected_total = create_response.json()["total_amount"]
    assert expected_total == 99

    patch_response = await client.patch(
        f"/api/invoices/{invoice_id}",
        json={"deposit_amount": 25},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert patch_response.status_code == 200
    patched = patch_response.json()
    assert patched["total_amount"] == expected_total
    assert patched["deposit_amount"] == 25

    detail_response = await client.get(f"/api/invoices/{invoice_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["total_amount"] == expected_total
    assert detail_response.json()["deposit_amount"] == 25


async def test_invoice_patch_deposit_exceeds_total_returns_422_without_partial_write(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/invoices",
        json={
            "customer_id": customer_id,
            "title": "Direct invoice",
            "transcript": "direct invoice transcript",
            "line_items": [{"description": "Work", "details": None, "price": 100}],
            "total_amount": 100,
            "discount_type": "fixed",
            "discount_value": 10,
            "tax_rate": 0.1,
            "notes": "Original note",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    invoice_id = create_response.json()["id"]
    expected_total = create_response.json()["total_amount"]

    patch_response = await client.patch(
        f"/api/invoices/{invoice_id}",
        json={"deposit_amount": float(expected_total) + 1},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert patch_response.status_code == 422
    assert patch_response.json() == {"detail": "Deposit cannot exceed the total amount"}

    detail_response = await client.get(f"/api/invoices/{invoice_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["deposit_amount"] is None
    assert detail_response.json()["total_amount"] == expected_total


async def test_invoice_patch_discount_value_null_clears_discount_and_recomputes_total(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/invoices",
        json={
            "customer_id": customer_id,
            "title": "Direct invoice",
            "transcript": "direct invoice transcript",
            "line_items": [{"description": "Work", "details": None, "price": 100}],
            "total_amount": 100,
            "discount_type": "fixed",
            "discount_value": 20,
            "tax_rate": 0.1,
            "notes": "Original note",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    invoice_id = create_response.json()["id"]
    assert create_response.json()["total_amount"] == 88

    patch_response = await client.patch(
        f"/api/invoices/{invoice_id}",
        json={"discount_value": None},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert patch_response.status_code == 200
    patched = patch_response.json()
    assert patched["discount_type"] is None
    assert patched["discount_value"] is None
    assert patched["tax_rate"] == 0.1
    assert patched["total_amount"] == 110


async def test_invoice_patch_tax_rate_only_recomputes_total_from_reverse_subtotal(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)

    create_response = await client.post(
        "/api/invoices",
        json={
            "customer_id": customer_id,
            "title": "Direct invoice",
            "transcript": "direct invoice transcript",
            "line_items": [{"description": "Work", "details": None, "price": 100}],
            "total_amount": 100,
            "tax_rate": 0.1,
            "notes": "Original note",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert create_response.status_code == 201
    invoice_id = create_response.json()["id"]
    assert create_response.json()["total_amount"] == 110

    patch_response = await client.patch(
        f"/api/invoices/{invoice_id}",
        json={"tax_rate": 0.2},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert patch_response.status_code == 200
    patched = patch_response.json()
    assert patched["tax_rate"] == 0.2
    assert patched["total_amount"] == 120


@pytest.mark.parametrize(
    "starting_status",
    [
        QuoteStatus.DRAFT,
        QuoteStatus.READY,
        QuoteStatus.SHARED,
        QuoteStatus.VIEWED,
        QuoteStatus.APPROVED,
        QuoteStatus.DECLINED,
    ],
)
async def test_convert_quote_to_invoice_rejects_duplicates_and_patch_preserves_sent_invoice_status(
    client: AsyncClient,
    db_session: AsyncSession,
    starting_status: QuoteStatus,
) -> None:
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
        pdf_response = await client.post(
            f"/api/quotes/{quote_id}/pdf",
            headers={"X-CSRF-Token": csrf_token},
        )
        assert pdf_response.status_code == 200
    elif starting_status is not QuoteStatus.DRAFT and starting_status is not QuoteStatus.SHARED:
        await _set_quote_status(db_session, quote_id, starting_status)

    first_convert = await client.post(
        f"/api/quotes/{quote_id}/convert-to-invoice",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert first_convert.status_code == 201
    invoice_id = first_convert.json()["id"]

    second_convert = await client.post(
        f"/api/quotes/{quote_id}/convert-to-invoice",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert second_convert.status_code == 409
    assert second_convert.json() == {"detail": "An invoice already exists for this quote"}

    share_response = await client.post(
        f"/api/invoices/{invoice_id}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    assert share_response.json()["status"] == "sent"
    original_share_token = share_response.json()["share_token"]

    patch_response = await client.patch(
        f"/api/invoices/{invoice_id}",
        json={
            "title": "Updated invoice",
            "line_items": [
                {
                    "description": "Final walkthrough",
                    "details": "Touch-up and cleanup",
                    "price": 90,
                }
            ],
            "total_amount": 90,
            "notes": "Updated after customer call",
            "due_date": "2026-05-01",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert patch_response.status_code == 200
    patched_invoice = patch_response.json()
    assert patched_invoice["status"] == "sent"
    assert patched_invoice["title"] == "Updated invoice"
    assert patched_invoice["total_amount"] == 90
    assert patched_invoice["notes"] == "Updated after customer call"
    assert patched_invoice["due_date"] == "2026-05-01"
    assert patched_invoice["share_token"] == original_share_token
    assert patched_invoice["line_items"] == [
        {
            "description": "Final walkthrough",
            "details": "Touch-up and cleanup",
            "id": patched_invoice["line_items"][0]["id"],
            "price": 90,
            "sort_order": 0,
        }
    ]


@pytest.mark.parametrize(
    ("method", "path_suffix", "payload"),
    [
        ("get", "", None),
        ("patch", "", {"due_date": "2026-05-01"}),
        ("post", "/pdf", None),
        ("post", "/share", None),
    ],
)
async def test_invoice_endpoints_return_404_for_different_users_invoice(
    client: AsyncClient,
    db_session: AsyncSession,
    method: str,
    path_suffix: str,
    payload: dict[str, object] | None,
) -> None:
    owner_csrf_token = await _register_and_login(client, _credentials())
    invoice = await _create_approved_invoice(client, owner_csrf_token, db_session)

    other_user_csrf_token = await _register_and_login(client, _credentials())
    request_method = getattr(client, method)
    headers = {"X-CSRF-Token": other_user_csrf_token} if method != "get" else None

    if payload is None:
        response = await request_method(
            f"/api/invoices/{invoice['id']}{path_suffix}",
            headers=headers,
        )
    else:
        response = await request_method(
            f"/api/invoices/{invoice['id']}{path_suffix}",
            json=payload,
            headers=headers,
        )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


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


async def _create_direct_invoice(
    client: AsyncClient,
    csrf_token: str,
    customer_id: str,
    *,
    title: str | None,
    transcript: str,
    total_amount: int,
) -> dict[str, object]:
    response = await client.post(
        "/api/invoices",
        json={
            "customer_id": customer_id,
            "title": title,
            "transcript": transcript,
            "line_items": [{"description": "line item", "details": None, "price": total_amount}],
            "total_amount": total_amount,
            "notes": "Original note",
            "source_type": "text",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert response.status_code == 201
    return response.json()


async def _create_approved_invoice(
    client: AsyncClient,
    csrf_token: str,
    db_session: AsyncSession,
) -> dict[str, object]:
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)
    await _set_quote_status(db_session, quote["id"], QuoteStatus.APPROVED)

    response = await client.post(
        f"/api/quotes/{quote['id']}/convert-to-invoice",
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


async def _set_user_email_and_phone_number(
    db_session: AsyncSession,
    *,
    email: str,
    updated_email: str,
    phone_number: str | None,
) -> None:
    user = await _get_user_by_email(db_session, email)
    user.email = updated_email
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


async def _set_invoice_status(
    db_session: AsyncSession,
    invoice_id: object,
    status: QuoteStatus,
) -> None:
    assert isinstance(invoice_id, str)
    invoice = await db_session.scalar(select(Document).where(Document.id == UUID(invoice_id)))
    assert invoice is not None
    invoice.status = status
    await db_session.commit()


def _format_human_date(value: object) -> str:
    assert isinstance(value, str)
    return date.fromisoformat(value).strftime("%b %d, %Y").replace(" 0", " ")


def _credentials() -> dict[str, str]:
    suffix = uuid4().hex[:12]
    return {
        "email": f"user-{suffix}@example.com",
        "password": "StrongPass123!",
    }
