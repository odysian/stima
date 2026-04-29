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
from app.features.quotes.schemas import (
    ExtractionMode,
    ExtractionResult,
    LineItemExtractedV2,
    PreparedCaptureInput,
    PricingHints,
)
from app.features.quotes.service import QuoteService, QuoteServiceError
from app.features.quotes.tests import test_quotes as quotes_test_module
from app.features.quotes.tests.support.helpers import (
    _create_customer,
    _credentials,
    _get_user_by_email,
    _register_and_login,
    _run_extraction_job,
)
from app.features.quotes.tests.support.mocks import (
    _FailingArqPool,
    _MockArqPool,
    _MockAudioIntegration,
    _MockExtractionIntegration,
    _MockTranscriptionIntegration,
    _RetryableFailureExtractionIntegration,
    _RetryableProviderError,
)
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


def _assert_public_extraction_contract(payload: dict[str, object]) -> None:
    assert "pipeline_version" not in payload
    assert "unresolved_segments" not in payload
    line_items = payload.get("line_items")
    assert isinstance(line_items, list)
    for line_item in line_items:
        assert isinstance(line_item, dict)
        assert "raw_text" not in line_item
        assert "confidence" not in line_item


def _extract_headers(csrf_token: str, *, idempotency_key: str | None = None) -> dict[str, str]:
    headers = {"X-CSRF-Token": csrf_token}
    if idempotency_key is not None:
        headers["Idempotency-Key"] = idempotency_key
    return headers


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
    _assert_public_extraction_contract(payload)
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
    _assert_public_extraction_contract(payload)
    assert payload["quote_id"]
    assert payload["transcript"] == "add 10 percent travel surcharge"
    assert payload["line_items"]


async def test_extract_combined_replays_same_idempotency_key_without_second_quote(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    app.state.arq_pool = None

    first_response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "mulch and edging"))],
        headers=_extract_headers(csrf_token, idempotency_key="extract-replay-key"),
    )
    second_response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "mulch and edging"))],
        headers=_extract_headers(csrf_token, idempotency_key="extract-replay-key"),
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert second_response.headers["Idempotency-Replayed"] == "true"
    assert second_response.json()["quote_id"] == first_response.json()["quote_id"]

    quote_count = await db_session.scalar(select(func.count(Document.id)))
    assert quote_count == 1


async def test_extract_combined_same_idempotency_key_with_different_content_returns_422(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    app.state.arq_pool = None

    first_response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "mulch and edging"))],
        headers=_extract_headers(csrf_token, idempotency_key="extract-conflict-key"),
    )
    second_response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "different capture content"))],
        headers=_extract_headers(csrf_token, idempotency_key="extract-conflict-key"),
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 422
    assert second_response.json() == {"detail": "Idempotency key reused with different content"}


async def test_extract_combined_same_idempotency_key_with_same_size_different_clips_returns_422(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    app.state.arq_pool = None

    first_response = await client.post(
        "/api/quotes/extract",
        files=[
            ("clips", ("clip-1.webm", b"aaaa", "audio/webm")),
            ("notes", (None, "mulch and edging")),
        ],
        headers=_extract_headers(csrf_token, idempotency_key="extract-clip-conflict-key"),
    )
    second_response = await client.post(
        "/api/quotes/extract",
        files=[
            ("clips", ("clip-1.webm", b"bbbb", "audio/webm")),
            ("notes", (None, "mulch and edging")),
        ],
        headers=_extract_headers(csrf_token, idempotency_key="extract-clip-conflict-key"),
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 422
    assert second_response.json() == {"detail": "Idempotency key reused with different content"}


async def test_extract_combined_duplicate_in_progress_idempotency_key_returns_409(
    client: AsyncClient,
) -> None:
    class _BlockingExtractionIntegration:
        def __init__(self) -> None:
            self.started = asyncio.Event()
            self.release = asyncio.Event()

        async def extract(
            self,
            notes: PreparedCaptureInput,
            *,
            mode: ExtractionMode = "initial",
        ) -> ExtractionResult:
            del mode
            self.started.set()
            await self.release.wait()
            return ExtractionResult(
                transcript=notes.transcript,
                line_items=[],
                pricing_hints=PricingHints(),
            )

    blocking_integration = _BlockingExtractionIntegration()

    async def _override_get_extraction_service() -> ExtractionService:
        return ExtractionService(
            extraction_integration=blocking_integration,
            audio_integration=_MockAudioIntegration(),
            transcription_integration=_MockTranscriptionIntegration(),
        )

    app.dependency_overrides[get_extraction_service] = _override_get_extraction_service
    app.state.arq_pool = None
    csrf_token = await _register_and_login(client, _credentials())

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as second_client:
        second_client.cookies.update(client.cookies)
        first_request = asyncio.create_task(
            client.post(
                "/api/quotes/extract",
                files=[("notes", (None, "mulch and edging"))],
                headers=_extract_headers(csrf_token, idempotency_key="extract-inflight-key"),
            )
        )
        await blocking_integration.started.wait()

        blocked_response = await second_client.post(
            "/api/quotes/extract",
            files=[("notes", (None, "mulch and edging"))],
            headers=_extract_headers(csrf_token, idempotency_key="extract-inflight-key"),
        )

        blocking_integration.release.set()
        first_response = await first_request

    assert first_response.status_code == 200
    assert blocked_response.status_code == 409
    assert blocked_response.json() == {"detail": "Extraction already in progress for this key"}


async def test_extract_combined_without_idempotency_key_creates_new_quotes(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    app.state.arq_pool = None

    first_response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "mulch and edging"))],
        headers=_extract_headers(csrf_token),
    )
    second_response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "mulch and edging"))],
        headers=_extract_headers(csrf_token),
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert first_response.json()["quote_id"] != second_response.json()["quote_id"]

    quote_count = await db_session.scalar(select(func.count(Document.id)))
    assert quote_count == 2


async def test_extract_combined_keeps_null_price_rows_without_price_status_contract(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_extract = _MockExtractionIntegration.extract

    async def _extract_with_included_scope(
        self,
        notes: PreparedCaptureInput | str,
        *,
        mode: ExtractionMode = "initial",
    ) -> ExtractionResult:
        transcript = (
            notes.transcript.strip() if isinstance(notes, PreparedCaptureInput) else notes.strip()
        )
        if transcript != "included scope provider status check":
            return await original_extract(self, notes, mode=mode)
        return ExtractionResult(
            transcript=transcript,
            line_items=[
                LineItemExtractedV2(
                    raw_text="Cleanup labor included",
                    description="Cleanup labor",
                    details="Included / no charge",
                    price=None,
                    confidence="medium",
                )
            ],
            pricing_hints=PricingHints(explicit_total=None),
        )

    monkeypatch.setattr(_MockExtractionIntegration, "extract", _extract_with_included_scope)
    csrf_token = await _register_and_login(client, _credentials())
    app.state.arq_pool = None

    response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "included scope provider status check"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["line_items"][0]["price"] is None
    assert "price_status" not in payload["line_items"][0]

    detail_response = await client.get(f"/api/quotes/{payload['quote_id']}")
    assert detail_response.status_code == 200
    detail_payload = detail_response.json()
    assert detail_payload["line_items"][0]["price"] is None
    assert "price_status" not in detail_payload["line_items"][0]


async def test_extract_combined_preserves_mixed_priced_and_blank_rows_across_reload(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_extract = _MockExtractionIntegration.extract

    async def _extract_mixed_price_rows(
        self,
        notes: PreparedCaptureInput | str,
        *,
        mode: ExtractionMode = "initial",
    ) -> ExtractionResult:
        transcript = (
            notes.transcript.strip() if isinstance(notes, PreparedCaptureInput) else notes.strip()
        )
        if transcript != "mixed price status regression check":
            return await original_extract(self, notes, mode=mode)
        return ExtractionResult(
            transcript=transcript,
            line_items=[
                LineItemExtractedV2(
                    raw_text="Mulch 120",
                    description="Mulch",
                    details="3 yards",
                    price=120,
                    confidence="medium",
                ),
                LineItemExtractedV2(
                    raw_text="Cleanup included",
                    description="Cleanup",
                    details="Included / no charge",
                    price=None,
                    confidence="medium",
                ),
                LineItemExtractedV2(
                    raw_text="Edging TBD",
                    description="Edging",
                    details="Need exact material cost",
                    price=None,
                    confidence="low",
                ),
            ],
            pricing_hints=PricingHints(explicit_total=180),
        )

    monkeypatch.setattr(_MockExtractionIntegration, "extract", _extract_mixed_price_rows)
    csrf_token = await _register_and_login(client, _credentials())
    app.state.arq_pool = None

    response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "mixed price status regression check"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert all("price_status" not in item for item in payload["line_items"])
    assert payload["line_items"][0]["price"] == 120
    assert payload["line_items"][2]["price"] is None

    quote_id = payload["quote_id"]
    detail_response = await client.get(f"/api/quotes/{quote_id}")
    assert detail_response.status_code == 200
    detail_payload = detail_response.json()
    assert all("price_status" not in item for item in detail_payload["line_items"])
    assert detail_payload["line_items"][0]["price"] == 120
    assert detail_payload["line_items"][2]["price"] is None
    assert detail_payload["total_amount"] == 120
    assert detail_payload["extraction_review_metadata"]["review_state"]["pricing_pending"] is False

    patch_response = await client.patch(
        f"/api/quotes/{quote_id}",
        json={"title": "Review mixed pricing"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert patch_response.status_code == 200
    patched_payload = patch_response.json()
    assert all("price_status" not in item for item in patched_payload["line_items"])

    reloaded_detail_response = await client.get(f"/api/quotes/{quote_id}")
    assert reloaded_detail_response.status_code == 200
    reloaded_detail_payload = reloaded_detail_response.json()
    assert all("price_status" not in item for item in reloaded_detail_payload["line_items"])
    assert reloaded_detail_payload["line_items"][0]["price"] == 120
    assert reloaded_detail_payload["line_items"][2]["price"] is None
    assert reloaded_detail_payload["total_amount"] == 120


async def test_extract_combined_sync_passes_initial_mode_to_extraction_integration(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recorded_modes: list[ExtractionMode] = []
    original_extract = _MockExtractionIntegration.extract

    async def _capture_mode(
        self,
        notes: PreparedCaptureInput | str,
        *,
        mode: ExtractionMode = "initial",
    ) -> ExtractionResult:
        recorded_modes.append(mode)
        return await original_extract(self, notes, mode=mode)

    monkeypatch.setattr(_MockExtractionIntegration, "extract", _capture_mode)
    csrf_token = await _register_and_login(client, _credentials())
    app.state.arq_pool = None

    response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "initial extraction mode check"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    assert recorded_modes == ["initial"]


async def test_append_extraction_endpoint_is_removed(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        f"/api/quotes/{uuid4()}/append-extraction",
        files=[("notes", (None, "add one more item"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}


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

    async def _retryable_extract(
        self,
        notes: str,
        *,
        mode: ExtractionMode = "initial",
    ) -> ExtractionResult:  # noqa: ANN001
        del self, notes, mode
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
                "prepared_capture_input": {
                    "transcript": "mulch the front beds",
                    "source_type": "text",
                    "raw_typed_notes": "mulch the front beds",
                    "raw_transcript": None,
                },
                "extraction_mode": "initial",
                "source_type": "text",
                "capture_detail": "notes",
                "customer_id": None,
            },
        }
    ]


async def test_extract_combined_enqueues_async_job_with_mixed_source(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    pool = _MockArqPool()
    app.state.arq_pool = pool

    response = await client.post(
        "/api/quotes/extract",
        files=[
            ("clips", ("clip-1.webm", b"clip-a", "audio/webm")),
            ("notes", (None, "add 10 percent travel surcharge")),
        ],
        headers={"X-CSRF-Token": csrf_token},
    )

    jobs = (await db_session.scalars(select(JobRecord))).all()

    assert response.status_code == 202
    assert len(jobs) == 1
    assert pool.calls[0]["kwargs"]["source_type"] == "voice+text"
    assert pool.calls[0]["kwargs"]["capture_detail"] == "audio+notes"
    prepared_capture_input = pool.calls[0]["kwargs"]["prepared_capture_input"]
    assert isinstance(prepared_capture_input, dict)
    assert prepared_capture_input["source_type"] == "voice+text"


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
    assert status_payload["extraction_result"] is not None
    _assert_public_extraction_contract(status_payload["extraction_result"])
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
    assert status_payload["extraction_result"] is not None
    _assert_public_extraction_contract(status_payload["extraction_result"])
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


async def test_manual_price_edit_clears_spoken_money_correction_flag(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_extract = _MockExtractionIntegration.extract

    async def _extract_with_spoken_money_flag(
        self,
        notes: PreparedCaptureInput | str,
        *,
        mode: ExtractionMode = "initial",
    ) -> ExtractionResult:
        transcript = (
            notes.transcript.strip() if isinstance(notes, PreparedCaptureInput) else notes.strip()
        )
        if transcript != "spoken money correction check":
            return await original_extract(self, notes, mode=mode)
        return ExtractionResult(
            transcript=transcript,
            line_items=[
                LineItemExtractedV2(
                    raw_text="price is four fifty for mulch",
                    description="Brown mulch",
                    details="price is four fifty for mulch",
                    price=450,
                    flagged=True,
                    flag_reason="spoken_money_correction",
                    confidence="medium",
                )
            ],
            pricing_hints=PricingHints(explicit_total=450),
        )

    monkeypatch.setattr(_MockExtractionIntegration, "extract", _extract_with_spoken_money_flag)
    csrf_token = await _register_and_login(client, _credentials())
    app.state.arq_pool = None

    extract_response = await client.post(
        "/api/quotes/extract",
        files=[("notes", (None, "spoken money correction check"))],
        headers={"X-CSRF-Token": csrf_token},
    )
    assert extract_response.status_code == 200
    quote_id = extract_response.json()["quote_id"]

    patch_response = await client.patch(
        f"/api/quotes/{quote_id}",
        json={
            "line_items": [
                {
                    "description": "Brown mulch",
                    "details": "price is four fifty for mulch",
                    "price": 500,
                    "flagged": True,
                    "flag_reason": "spoken_money_correction",
                }
            ]
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert patch_response.status_code == 200
    patched_line_item = patch_response.json()["line_items"][0]
    assert patched_line_item["price"] == 500
    assert patched_line_item["flagged"] is False
    assert patched_line_item["flag_reason"] is None


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
    quote_response = await client.get(
        f"/api/quotes/{payload['quote_id']}",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert quote_response.status_code == 200
    assert quote_response.json()["source_type"] == "voice+text"


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
    monkeypatch.setenv("QUOTE_COMBINED_EXTRACT_RATE_LIMIT", "1/hour")
    get_settings.cache_clear()
    try:
        csrf_token = await _register_and_login(client, _credentials())

        response = await client.post(
            "/api/quotes/extract",
            files=[("notes", (None, "note 1"))],
            headers={"X-CSRF-Token": csrf_token},
        )
        assert response.status_code == 200

        response = await client.post(
            "/api/quotes/extract",
            files=[("notes", (None, "rate limited request"))],
            headers={"X-CSRF-Token": csrf_token},
        )

        assert response.status_code == 429
    finally:
        get_settings.cache_clear()


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

        async def extract(
            self,
            notes: PreparedCaptureInput,
            *,
            mode: ExtractionMode = "initial",
        ) -> ExtractionResult:
            del mode
            self.started.set()
            await self.release.wait()
            return ExtractionResult(
                transcript=notes.transcript,
                line_items=[],
                pricing_hints=PricingHints(),
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
