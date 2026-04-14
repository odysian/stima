"""Quote API behavior tests for extraction, CRUD flow, and ownership scoping."""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from datetime import date
from types import SimpleNamespace
from typing import Annotated, TypedDict
from uuid import UUID, uuid4

import pytest
from fastapi import Depends
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.database import get_db
from app.features.auth.models import User
from app.features.auth.service import CSRF_COOKIE_NAME
from app.features.invoices import (
    email_delivery_service as invoice_email_delivery_service,
)
from app.features.quotes import email_delivery_service
from app.features.quotes.extraction_service import ExtractionService
from app.features.quotes.models import Document, QuoteStatus
from app.features.quotes.repository import QuoteRenderContext, QuoteRepository
from app.features.quotes.schemas import (
    ExtractionResult,
    LineItemExtracted,
)
from app.features.quotes.service import QuoteService
from app.integrations.audio import AudioClip, AudioError
from app.integrations.email import EmailConfigurationError, EmailMessage, EmailSendError
from app.integrations.extraction import ExtractionError
from app.integrations.storage import StorageNotFoundError
from app.integrations.transcription import TranscriptionError
from app.main import app
from app.shared.dependencies import (
    get_email_service,
    get_extraction_service,
    get_quote_service,
    get_storage_service,
)
from app.shared.idempotency import IdempotencyBeginResult
from app.shared.rate_limit import reset_local_rate_limit_state
from app.worker.job_registry import extraction_job, pdf_job
from app.worker.runtime import (
    DEFAULT_MAX_TRIES,
    DEFAULT_RETRY_BASE_SECONDS,
    DEFAULT_RETRY_JITTER_SECONDS,
    WorkerRuntimeSettings,
)

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
    class _EnqueueCall(TypedDict):
        function: str
        args: tuple[object, ...]
        kwargs: dict[str, object]

    def __init__(self) -> None:
        self.calls: list[_MockArqPool._EnqueueCall] = []

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


class _RetryableProviderError(Exception):
    def __init__(self, status_code: int) -> None:
        super().__init__(f"provider error {status_code}")
        self.status_code = status_code


class _RetryableFailureExtractionIntegration:
    async def extract(self, notes: str) -> ExtractionResult:
        del notes
        raise ExtractionError("Claude request failed: retryable") from _RetryableProviderError(429)


def _send_email_headers(csrf_token: str, *, idempotency_key: str | None = None) -> dict[str, str]:
    return {
        "X-CSRF-Token": csrf_token,
        "Idempotency-Key": idempotency_key or uuid4().hex,
    }


def _assert_async_email_job_response(response, *, document_id: str) -> dict[str, object]:
    assert response.status_code == 202
    payload = response.json()
    assert payload["job_type"] == "email"
    assert payload["status"] == "pending"
    assert payload["document_id"] == document_id
    return payload


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


@pytest.fixture(autouse=True)
def _mock_arq_pool_for_send_email_tests(
    request: pytest.FixtureRequest,
) -> Iterator[None]:
    node_name = request.node.name
    if (
        "send_quote_email" not in node_name
        and "send_invoice_email" not in node_name
        and "send_email" not in node_name
    ):
        yield
        return

    original_pool = getattr(app.state, "arq_pool", None)
    app.state.arq_pool = _MockArqPool()
    try:
        yield
    finally:
        app.state.arq_pool = original_pool


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


async def _run_pdf_job(db_session: AsyncSession, *, job_id: object) -> None:
    assert isinstance(job_id, str)
    session_maker = async_sessionmaker(
        bind=db_session.bind,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    runtime = WorkerRuntimeSettings(
        session_maker=session_maker,
        max_tries=DEFAULT_MAX_TRIES,
        retry_base_seconds=DEFAULT_RETRY_BASE_SECONDS,
        retry_jitter_seconds=DEFAULT_RETRY_JITTER_SECONDS,
    )
    await pdf_job(
        {
            "job_try": 1,
            "worker_runtime": runtime,
            "pdf_integration": _MockPdfIntegration(),
            "storage_service": _MockStorageService(),
        },
        job_id,
    )


async def _run_extraction_job(
    db_session: AsyncSession,
    *,
    job_id: object,
    source_type: str,
    capture_detail: str,
    customer_id: str | None = None,
    append_to_quote: bool = False,
    transcript: str = "mulch the front beds",
    job_try: int = 1,
    extraction_integration: object | None = None,
    correlation_id: str | None = None,
) -> None:
    assert isinstance(job_id, str)
    session_maker = async_sessionmaker(
        bind=db_session.bind,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    runtime = WorkerRuntimeSettings(
        session_maker=session_maker,
        max_tries=DEFAULT_MAX_TRIES,
        retry_base_seconds=DEFAULT_RETRY_BASE_SECONDS,
        retry_jitter_seconds=DEFAULT_RETRY_JITTER_SECONDS,
    )
    resolved_extraction_integration = extraction_integration or _MockExtractionIntegration()
    await extraction_job(
        {
            "job_try": job_try,
            "worker_runtime": runtime,
            "extraction_integration": resolved_extraction_integration,
        },
        job_id,
        correlation_id=correlation_id,
        transcript=transcript,
        source_type=source_type,
        capture_detail=capture_detail,
        customer_id=customer_id,
        append_to_quote=append_to_quote,
    )


def _format_human_date(value: object) -> str:
    assert isinstance(value, str)
    return date.fromisoformat(value).strftime("%b %d, %Y").replace(" 0", " ")


def _credentials() -> dict[str, str]:
    suffix = uuid4().hex[:12]
    return {
        "email": f"user-{suffix}@example.com",
        "password": "StrongPass123!",
    }
