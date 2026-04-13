"""Quote extraction and convert-notes API behavior tests."""

from __future__ import annotations

import asyncio
import json
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.features.jobs.models import JobRecord, JobStatus, JobType
from app.features.jobs.repository import JobRepository
from app.features.quotes.extraction_service import ExtractionService
from app.features.quotes.models import Document, QuoteStatus
from app.features.quotes.schemas import ExtractionResult
from app.features.quotes.service import QuoteService, QuoteServiceError
from app.features.quotes.tests import test_quotes as quotes_test_module
from app.integrations.extraction import ExtractionError
from app.main import app
from app.shared import event_logger
from app.shared.dependencies import get_extraction_service
from app.shared.input_limits import NOTE_INPUT_MAX_CHARS

pytestmark = pytest.mark.asyncio

# Reuse existing fixture wiring/helpers from test_quotes to preserve behavior.
_reset_email_delivery_fallback_cache = quotes_test_module._reset_email_delivery_fallback_cache
_override_storage_service_dependency = quotes_test_module._override_storage_service_dependency
_override_quote_service_dependency = quotes_test_module._override_quote_service_dependency
_override_extraction_service_dependency = quotes_test_module._override_extraction_service_dependency
_reset_rate_limiter = quotes_test_module._reset_rate_limiter
_register_and_login = quotes_test_module._register_and_login
_credentials = quotes_test_module._credentials
_create_customer = quotes_test_module._create_customer
_get_user_by_email = quotes_test_module._get_user_by_email
_MockArqPool = quotes_test_module._MockArqPool
_FailingArqPool = quotes_test_module._FailingArqPool
_RetryableFailureExtractionIntegration = quotes_test_module._RetryableFailureExtractionIntegration
_MockExtractionIntegration = quotes_test_module._MockExtractionIntegration
_RetryableProviderError = quotes_test_module._RetryableProviderError
_MockAudioIntegration = quotes_test_module._MockAudioIntegration
_MockTranscriptionIntegration = quotes_test_module._MockTranscriptionIntegration
_run_extraction_job = quotes_test_module._run_extraction_job


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


async def test_extract_combined_logs_persistence_failure_event_by_status_code(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    emitted_events: list[dict[str, str]] = []

    def _capture(message: str) -> None:
        emitted_events.append(json.loads(message))

    async def _fail_create_extracted_draft(self, **kwargs):  # noqa: ANN001, ANN003
        del self, kwargs
        raise QuoteServiceError(detail="database unavailable", status_code=503)

    monkeypatch.setattr(event_logger._EVENT_LOGGER, "info", _capture)  # noqa: SLF001
    monkeypatch.setattr(QuoteService, "create_extracted_draft", _fail_create_extracted_draft)

    csrf_token = await _register_and_login(client, _credentials())
    app.state.arq_pool = None
    response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "mulch the front beds"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "database unavailable"}
    assert [payload["event"] for payload in emitted_events] == [
        "quote_started",
        "draft_generation_failed",
    ]
    assert emitted_events[-1]["detail"] == "notes"


async def test_extract_combined_notes_only_success(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "add 10 percent travel surcharge"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["quote_id"]
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
    payload = response.json()
    assert payload["quote_id"]
    assert payload["transcript"] == "mulch the front beds"
    assert payload["extraction_tier"] == "primary"
    assert payload["extraction_degraded_reason_code"] is None
    assert int(job_count or 0) == 0

    persisted_quote = await db_session.get(Document, UUID(payload["quote_id"]))
    assert persisted_quote is not None
    assert persisted_quote.status == QuoteStatus.DRAFT
    assert persisted_quote.customer_id is None
    assert persisted_quote.transcript == "mulch the front beds"
    assert persisted_quote.extraction_tier == "primary"
    assert persisted_quote.extraction_degraded_reason_code is None


async def test_extract_combined_sync_retryable_failure_persists_degraded_draft(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    emitted_events: list[dict[str, str]] = []

    def _capture(message: str) -> None:
        emitted_events.append(json.loads(message))

    async def _retryable_extract(self, notes: str) -> ExtractionResult:  # noqa: ANN001
        del self, notes
        raise ExtractionError("Claude request failed: retryable") from _RetryableProviderError(429)

    monkeypatch.setattr(event_logger._EVENT_LOGGER, "info", _capture)  # noqa: SLF001
    monkeypatch.setattr(_MockExtractionIntegration, "extract", _retryable_extract)

    csrf_token = await _register_and_login(client, _credentials())
    app.state.arq_pool = None

    response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "mulch the front beds"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["quote_id"]
    assert payload["line_items"] == []
    assert payload["extraction_tier"] == "degraded"
    assert payload["extraction_degraded_reason_code"] == "provider_retryable_error"

    persisted_quote = await db_session.get(Document, UUID(payload["quote_id"]))
    assert persisted_quote is not None
    assert persisted_quote.extraction_tier == "degraded"
    assert persisted_quote.extraction_degraded_reason_code == "provider_retryable_error"
    assert [event["event"] for event in emitted_events] == [
        "quote_started",
        "quote.created",
        "draft_generated",
    ]
    assert emitted_events[-1]["extraction_outcome"] == "degraded"


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
    response_correlation_id = response.headers["x-correlation-id"]

    jobs = (await db_session.scalars(select(JobRecord))).all()

    assert response.status_code == 202
    payload = response.json()
    assert payload["job_type"] == "extraction"
    assert payload["status"] == "pending"
    assert payload["extraction_result"] is None
    assert payload["quote_id"] is None
    assert len(jobs) == 1
    assert jobs[0].status == JobStatus.PENDING
    assert pool.calls == [
        {
            "function": "jobs.extraction",
            "args": (str(jobs[0].id),),
            "kwargs": {
                "_job_id": str(jobs[0].id),
                "correlation_id": response_correlation_id,
                "transcript": "mulch the front beds",
                "source_type": "text",
                "capture_detail": "notes",
                "customer_id": None,
            },
        }
    ]


async def test_extract_combined_preserves_trusted_ingress_correlation_id_in_queue_payload(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ingress_correlation_id = "ingress-correlation-id-123"
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "127.0.0.1")
    get_settings.cache_clear()

    csrf_token = await _register_and_login(client, _credentials())
    pool = _MockArqPool()
    app.state.arq_pool = pool

    response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "mulch the front beds"))],
        headers={
            "X-CSRF-Token": csrf_token,
            "X-Correlation-ID": ingress_correlation_id,
        },
    )

    assert response.status_code == 202
    assert response.headers["x-correlation-id"] == ingress_correlation_id
    assert pool.calls[0]["kwargs"]["correlation_id"] == ingress_correlation_id


async def test_extract_combined_async_worker_persists_draft_and_returns_quote_id(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    emitted_events: list[dict[str, str]] = []

    def _capture(message: str) -> None:
        emitted_events.append(json.loads(message))

    monkeypatch.setattr(event_logger._EVENT_LOGGER, "info", _capture)  # noqa: SLF001

    csrf_token = await _register_and_login(client, _credentials())
    pool = _MockArqPool()
    app.state.arq_pool = pool

    response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "mulch the front beds"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    payload = response.json()
    await _run_extraction_job(
        db_session,
        job_id=payload["id"],
        source_type="text",
        capture_detail="notes",
    )

    status_response = await client.get(f"/api/jobs/{payload['id']}")
    assert status_response.status_code == 200
    status_payload = status_response.json()
    assert status_payload["status"] == "success"
    assert status_payload["quote_id"] is not None
    assert status_payload["document_id"] == status_payload["quote_id"]
    assert status_payload["extraction_result"]["transcript"] == "mulch the front beds"

    quote_response = await client.get(f"/api/quotes/{status_payload['quote_id']}")
    assert quote_response.status_code == 200
    quote_payload = quote_response.json()
    assert quote_payload["status"] == "draft"
    assert quote_payload["customer_id"] is None
    assert quote_payload["transcript"] == "mulch the front beds"
    assert quote_payload["extraction_tier"] == "primary"
    assert quote_payload["extraction_degraded_reason_code"] is None
    assert len(quote_payload["line_items"]) == 1

    matching_quote_events = [
        event
        for event in emitted_events
        if event.get("event") == "draft_generated"
        and event.get("quote_id") == status_payload["quote_id"]
    ]
    assert len(matching_quote_events) == 1
    assert matching_quote_events[0]["extraction_outcome"] == "primary"


async def test_extract_combined_async_final_retryable_failure_persists_degraded_draft(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    emitted_events: list[dict[str, str]] = []

    def _capture(message: str) -> None:
        emitted_events.append(json.loads(message))

    monkeypatch.setattr(event_logger._EVENT_LOGGER, "info", _capture)  # noqa: SLF001

    csrf_token = await _register_and_login(client, _credentials())
    pool = _MockArqPool()
    app.state.arq_pool = pool

    response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "mulch the front beds"))],
        headers={"X-CSRF-Token": csrf_token},
    )
    assert response.status_code == 202

    payload = response.json()
    await _run_extraction_job(
        db_session,
        job_id=payload["id"],
        source_type="text",
        capture_detail="notes",
        job_try=3,
        extraction_integration=_RetryableFailureExtractionIntegration(),
    )

    status_response = await client.get(f"/api/jobs/{payload['id']}")
    assert status_response.status_code == 200
    status_payload = status_response.json()
    assert status_payload["status"] == "success"
    assert status_payload["quote_id"] is not None
    assert status_payload["extraction_result"]["line_items"] == []
    assert status_payload["extraction_result"]["extraction_tier"] == "degraded"
    assert (
        status_payload["extraction_result"]["extraction_degraded_reason_code"]
        == "provider_retryable_error"
    )

    quote_response = await client.get(f"/api/quotes/{status_payload['quote_id']}")
    assert quote_response.status_code == 200
    quote_payload = quote_response.json()
    assert quote_payload["extraction_tier"] == "degraded"
    assert quote_payload["extraction_degraded_reason_code"] == "provider_retryable_error"

    matching_quote_events = [
        event
        for event in emitted_events
        if event.get("event") == "draft_generated"
        and event.get("quote_id") == status_payload["quote_id"]
    ]
    assert len(matching_quote_events) == 1
    assert matching_quote_events[0]["extraction_outcome"] == "degraded"
    assert all(event["event"] != "draft_generation_failed" for event in emitted_events)


async def test_extract_combined_sync_fallback_persists_preselected_customer(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    app.state.arq_pool = None

    response = await client.post(
        "/api/quotes/extract",
        files=[
            ("notes", (None, "mulch the front beds")),
            ("customer_id", (None, customer_id)),
        ],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["quote_id"]

    persisted_quote = await db_session.get(Document, UUID(payload["quote_id"]))
    assert persisted_quote is not None
    assert persisted_quote.customer_id == UUID(customer_id)


async def test_extract_combined_async_worker_persists_preselected_customer(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    pool = _MockArqPool()
    app.state.arq_pool = pool

    response = await client.post(
        "/api/quotes/extract",
        files=[
            ("notes", (None, "mulch the front beds")),
            ("customer_id", (None, customer_id)),
        ],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 202
    payload = response.json()
    assert pool.calls[0]["kwargs"]["customer_id"] == customer_id

    await _run_extraction_job(
        db_session,
        job_id=payload["id"],
        source_type="text",
        capture_detail="notes",
        customer_id=customer_id,
    )

    status_response = await client.get(f"/api/jobs/{payload['id']}")
    assert status_response.status_code == 200
    status_payload = status_response.json()
    assert status_payload["status"] == "success"
    assert status_payload["quote_id"] is not None

    persisted_quote = await db_session.get(Document, UUID(status_payload["quote_id"]))
    assert persisted_quote is not None
    assert persisted_quote.customer_id == UUID(customer_id)


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
