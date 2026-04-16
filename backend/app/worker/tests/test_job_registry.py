"""Extraction job registry tests."""

from __future__ import annotations

import json
from decimal import Decimal
from hashlib import sha256
from uuid import UUID, uuid4

import pytest
from app.features.auth.models import User
from app.features.jobs.models import JobRecord, JobStatus, JobType
from app.features.jobs.repository import JobRepository
from app.features.quotes.models import Document
from app.features.quotes.schemas import (
    ExtractionMode,
    ExtractionResult,
    ExtractionSuggestion,
    LineItemExtractedV2,
    PreparedCaptureInput,
    PricingHints,
)
from app.features.quotes.service import QuoteServiceError
from app.integrations.extraction import ExtractionCallMetadata, ExtractionError
from app.shared import event_logger, observability
from app.worker.job_registry import TERMINAL_ERROR_DRAFT_PERSISTENCE_FAILED, extraction_job
from app.worker.runtime import (
    NonRetryableJobError,
    WorkerRuntimeSettings,
)
from arq.worker import Retry
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

pytestmark = pytest.mark.asyncio


async def test_extraction_job_stores_result_json_on_success(
    db_session: AsyncSession,
) -> None:
    user = await _seed_user(db_session)
    repository = JobRepository(db_session)
    record = await repository.create(user_id=user.id, job_type=JobType.EXTRACTION)
    await db_session.commit()

    await extraction_job(
        _worker_context(
            db_session,
            extraction_integration=_SuccessfulExtractionIntegration(),
        ),
        str(record.id),
        transcript="mulch the front beds",
        source_type="text",
        capture_detail="notes",
    )

    refreshed = await _load_job_record(db_session, record.id)
    assert refreshed is not None  # nosec B101 - pytest assertion
    assert refreshed.status == JobStatus.SUCCESS  # nosec B101 - pytest assertion
    assert refreshed.result_json is not None  # nosec B101 - pytest assertion
    assert refreshed.document_id is not None  # nosec B101 - pytest assertion

    persisted_quote = await db_session.get(Document, refreshed.document_id)
    assert persisted_quote is not None  # nosec B101 - pytest assertion
    assert persisted_quote.transcript == "mulch the front beds"  # nosec B101 - pytest assertion
    assert persisted_quote.source_type == "text"  # nosec B101 - pytest assertion


async def test_extraction_job_accepts_legacy_enqueued_payload_without_source_metadata(
    db_session: AsyncSession,
) -> None:
    user = await _seed_user(db_session)
    repository = JobRepository(db_session)
    record = await repository.create(user_id=user.id, job_type=JobType.EXTRACTION)
    await db_session.commit()

    capture_integration = _CaptureInputExtractionIntegration()
    await extraction_job(
        _worker_context(
            db_session,
            extraction_integration=capture_integration,
        ),
        str(record.id),
        transcript="legacy queued transcript",
    )

    refreshed = await _load_job_record(db_session, record.id)
    assert refreshed is not None  # nosec B101 - pytest assertion
    assert refreshed.status == JobStatus.SUCCESS  # nosec B101 - pytest assertion
    assert refreshed.document_id is not None  # nosec B101 - pytest assertion

    persisted_quote = await db_session.get(Document, refreshed.document_id)
    assert persisted_quote is not None  # nosec B101 - pytest assertion
    assert persisted_quote.source_type == "text"  # nosec B101 - pytest assertion
    assert persisted_quote.transcript == "legacy queued transcript"  # nosec B101 - pytest assertion
    assert len(capture_integration.received_inputs) == 1  # nosec B101 - pytest assertion
    legacy_input = capture_integration.received_inputs[0]
    assert legacy_input.source_type == "text"  # nosec B101 - pytest assertion
    assert legacy_input.raw_typed_notes == "legacy queued transcript"  # nosec B101 - pytest assertion
    assert legacy_input.raw_transcript is None  # nosec B101 - pytest assertion


async def test_extraction_job_passes_append_mode_to_integration_for_append_jobs(
    db_session: AsyncSession,
) -> None:
    user = await _seed_user(db_session)
    repository = JobRepository(db_session)
    create_record = await repository.create(user_id=user.id, job_type=JobType.EXTRACTION)
    await db_session.commit()

    await extraction_job(
        _worker_context(
            db_session,
            extraction_integration=_SuccessfulSeededLineItemExtractionIntegration(),
        ),
        str(create_record.id),
        transcript="initial quote transcript",
        source_type="text",
        capture_detail="notes",
        extraction_mode="initial",
    )

    created_job = await _load_job_record(db_session, create_record.id)
    assert created_job is not None  # nosec B101 - pytest assertion
    assert created_job.document_id is not None  # nosec B101 - pytest assertion

    append_record = await repository.create(
        user_id=user.id,
        job_type=JobType.EXTRACTION,
        document_id=created_job.document_id,
    )
    await db_session.commit()

    capture_integration = _CaptureInputExtractionIntegration()
    await extraction_job(
        _worker_context(
            db_session,
            extraction_integration=capture_integration,
        ),
        str(append_record.id),
        transcript="append note for quote",
        source_type="text",
        capture_detail="notes",
        append_to_quote=True,
        extraction_mode="append",
    )

    refreshed_append_job = await _load_job_record(db_session, append_record.id)
    assert refreshed_append_job is not None  # nosec B101 - pytest assertion
    assert refreshed_append_job.status == JobStatus.SUCCESS  # nosec B101 - pytest assertion
    assert capture_integration.received_modes == ["append"]  # nosec B101 - pytest assertion


async def test_append_job_applies_against_current_quote_state_so_user_edits_win(
    db_session: AsyncSession,
) -> None:
    user = await _seed_user(db_session)
    repository = JobRepository(db_session)
    create_record = await repository.create(user_id=user.id, job_type=JobType.EXTRACTION)
    await db_session.commit()

    await extraction_job(
        _worker_context(
            db_session,
            extraction_integration=_SuccessfulSeededLineItemExtractionIntegration(),
        ),
        str(create_record.id),
        transcript="initial quote transcript",
        source_type="text",
        capture_detail="notes",
        extraction_mode="initial",
    )

    created_job = await _load_job_record(db_session, create_record.id)
    assert created_job is not None  # nosec B101 - pytest assertion
    assert created_job.document_id is not None  # nosec B101 - pytest assertion
    quote = await db_session.get(Document, created_job.document_id)
    assert quote is not None  # nosec B101 - pytest assertion
    quote.notes = "User edited notes while append was running"
    quote.total_amount = Decimal("100")
    quote.tax_rate = Decimal("0.09")
    await db_session.commit()

    append_record = await repository.create(
        user_id=user.id,
        job_type=JobType.EXTRACTION,
        document_id=created_job.document_id,
    )
    await db_session.commit()

    await extraction_job(
        _worker_context(
            db_session,
            extraction_integration=_AppendCandidateExtractionIntegration(),
        ),
        str(append_record.id),
        transcript="append note for quote",
        source_type="text",
        capture_detail="notes",
        append_to_quote=True,
        extraction_mode="append",
    )

    db_session.expire_all()
    refreshed_quote = await db_session.get(Document, created_job.document_id)
    assert refreshed_quote is not None  # nosec B101 - pytest assertion
    assert refreshed_quote.notes == "User edited notes while append was running"  # nosec B101 - pytest assertion
    assert refreshed_quote.tax_rate is not None  # nosec B101 - pytest assertion
    assert float(refreshed_quote.tax_rate) == 0.09  # nosec B101 - pytest assertion
    metadata_payload = refreshed_quote.extraction_review_metadata or {}
    hidden_details = metadata_payload.get("hidden_details", {})
    assert isinstance(hidden_details, dict)  # nosec B101 - pytest assertion
    hidden_items = hidden_details.get("items", [])
    assert isinstance(hidden_items, list)  # nosec B101 - pytest assertion
    assert any(
        isinstance(item, dict)
        and item.get("kind") == "append_suggestion"
        and item.get("field") == "notes"
        and item.get("text") == "Append note candidate"
        for item in hidden_items
    )  # nosec B101 - pytest assertion
    assert any(
        isinstance(item, dict)
        and item.get("kind") == "append_suggestion"
        and item.get("field") == "tax_rate"
        and item.get("text") == "Tax rate 0.07"
        for item in hidden_items
    )  # nosec B101 - pytest assertion


async def test_extraction_job_marks_terminal_when_draft_persistence_fails(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = await _seed_user(db_session)
    repository = JobRepository(db_session)
    record = await repository.create(user_id=user.id, job_type=JobType.EXTRACTION)
    await db_session.commit()

    async def _failing_create_extracted_draft(*args, **kwargs):  # noqa: ANN002, ANN003
        del args, kwargs
        raise QuoteServiceError(detail="persistence failed", status_code=503)

    monkeypatch.setattr(
        "app.features.quotes.service.QuoteService.create_extracted_draft",
        _failing_create_extracted_draft,
    )

    with pytest.raises(NonRetryableJobError, match=TERMINAL_ERROR_DRAFT_PERSISTENCE_FAILED):
        await extraction_job(
            _worker_context(
                db_session,
                extraction_integration=_SuccessfulExtractionIntegration(),
            ),
            str(record.id),
            transcript="mulch the front beds",
            source_type="text",
            capture_detail="notes",
        )

    refreshed = await _load_job_record(db_session, record.id)
    assert refreshed is not None  # nosec B101 - pytest assertion
    assert refreshed.status == JobStatus.TERMINAL  # nosec B101 - pytest assertion
    assert refreshed.terminal_error == TERMINAL_ERROR_DRAFT_PERSISTENCE_FAILED  # nosec B101 - pytest assertion
    assert refreshed.document_id is None  # nosec B101 - pytest assertion
    assert refreshed.result_json is None  # nosec B101 - pytest assertion


async def test_extraction_job_retries_provider_429_then_persists_degraded_on_final_attempt(
    db_session: AsyncSession,
) -> None:
    user = await _seed_user(db_session)
    repository = JobRepository(db_session)
    record = await repository.create(user_id=user.id, job_type=JobType.EXTRACTION)
    await db_session.commit()

    failing_integration = _RetryableFailureExtractionIntegration()

    with pytest.raises(Retry):
        await extraction_job(
            _worker_context(
                db_session,
                job_try=1,
                extraction_integration=failing_integration,
            ),
            str(record.id),
            transcript="mulch the front beds",
            source_type="text",
            capture_detail="notes",
        )

    after_first_failure = await _load_job_record(db_session, record.id)
    assert after_first_failure is not None  # nosec B101 - pytest assertion
    assert after_first_failure.status == JobStatus.FAILED  # nosec B101 - pytest assertion
    assert after_first_failure.document_id is None  # nosec B101 - pytest assertion
    assert after_first_failure.result_json is None  # nosec B101 - pytest assertion

    await extraction_job(
        _worker_context(
            db_session,
            job_try=3,
            extraction_integration=failing_integration,
        ),
        str(record.id),
        transcript="mulch the front beds",
        source_type="text",
        capture_detail="notes",
    )

    degraded_record = await _load_job_record(db_session, record.id)
    assert degraded_record is not None  # nosec B101 - pytest assertion
    assert degraded_record.status == JobStatus.SUCCESS  # nosec B101 - pytest assertion
    assert degraded_record.terminal_error is None  # nosec B101 - pytest assertion
    assert degraded_record.document_id is not None  # nosec B101 - pytest assertion
    assert degraded_record.result_json is not None  # nosec B101 - pytest assertion

    persisted_quote = await db_session.get(Document, degraded_record.document_id)
    assert persisted_quote is not None  # nosec B101 - pytest assertion
    assert persisted_quote.extraction_tier == "degraded"  # nosec B101 - pytest assertion
    assert persisted_quote.extraction_degraded_reason_code == "provider_retryable_error"  # nosec B101 - pytest assertion
    assert persisted_quote.transcript == "mulch the front beds"  # nosec B101 - pytest assertion

    stored_result = ExtractionResult.model_validate_json(degraded_record.result_json)
    assert stored_result.extraction_tier == "degraded"  # nosec B101 - pytest assertion
    assert stored_result.extraction_degraded_reason_code == "provider_retryable_error"  # nosec B101 - pytest assertion
    assert stored_result.line_items == []  # nosec B101 - pytest assertion


async def test_extraction_job_persists_validation_repair_failed_degraded_result_without_retry(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    security_logs: list[dict[str, object]] = []

    def _capture_security(payload: dict[str, object], *, level: int) -> None:
        security_logs.append({**payload, "_level": level})

    monkeypatch.setattr(observability, "_emit_security_payload", _capture_security)

    user = await _seed_user(db_session)
    repository = JobRepository(db_session)
    record = await repository.create(user_id=user.id, job_type=JobType.EXTRACTION)
    await db_session.commit()

    await extraction_job(
        _worker_context(
            db_session,
            extraction_integration=_ValidationRepairFailedExtractionIntegration(),
        ),
        str(record.id),
        transcript="mulch the front beds",
        source_type="text",
        capture_detail="notes",
    )

    refreshed = await _load_job_record(db_session, record.id)
    assert refreshed is not None  # nosec B101 - pytest assertion
    assert refreshed.status == JobStatus.SUCCESS  # nosec B101 - pytest assertion
    assert refreshed.document_id is not None  # nosec B101 - pytest assertion

    persisted_quote = await db_session.get(Document, refreshed.document_id)
    assert persisted_quote is not None  # nosec B101 - pytest assertion
    assert persisted_quote.extraction_tier == "degraded"  # nosec B101 - pytest assertion
    assert persisted_quote.extraction_degraded_reason_code == "validation_repair_failed"  # nosec B101 - pytest assertion

    repair_log = next(log for log in security_logs if log.get("event") == "quotes.extract_repair")
    assert repair_log["outcome"] == "repair_invalid"  # nosec B101 - pytest assertion
    assert repair_log["repair_validation_error_count"] == 1  # nosec B101 - pytest assertion
    assert repair_log["extraction_tier"] == "degraded"  # nosec B101 - pytest assertion
    assert (  # nosec B101 - pytest assertion
        repair_log["extraction_degraded_reason_code"] == "validation_repair_failed"
    )


async def test_extraction_job_logs_draft_generation_failed_on_terminal_failure(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    emitted_events: list[dict[str, str]] = []

    def _capture(message: str) -> None:
        emitted_events.append(json.loads(message))

    monkeypatch.setattr(event_logger._EVENT_LOGGER, "info", _capture)  # noqa: SLF001
    user = await _seed_user(db_session)
    repository = JobRepository(db_session)
    record = await repository.create(user_id=user.id, job_type=JobType.EXTRACTION)
    await db_session.commit()

    with pytest.raises(ExtractionError):
        await extraction_job(
            _worker_context(
                db_session,
                extraction_integration=_NonRetryableFailureExtractionIntegration(),
            ),
            str(record.id),
            transcript="mulch the front beds",
            source_type="text",
            capture_detail="notes",
        )

    refreshed = await _load_job_record(db_session, record.id)
    assert refreshed is not None  # nosec B101 - pytest assertion
    assert refreshed.status == JobStatus.TERMINAL  # nosec B101 - pytest assertion
    assert [event["event"] for event in emitted_events] == ["draft_generation_failed"]  # nosec B101 - pytest assertion
    assert emitted_events[0]["detail"] == "notes"  # nosec B101 - pytest assertion
    assert "quote_id" not in emitted_events[0]  # nosec B101 - pytest assertion


async def test_extraction_job_uses_enqueued_correlation_id_and_logs_failure_metadata(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    security_logs: list[dict[str, object]] = []

    def _capture_security(payload: dict[str, object], *, level: int) -> None:
        security_logs.append({**payload, "_level": level})

    monkeypatch.setattr(observability, "_emit_security_payload", _capture_security)
    user = await _seed_user(db_session)
    repository = JobRepository(db_session)
    record = await repository.create(user_id=user.id, job_type=JobType.EXTRACTION)
    await db_session.commit()

    ingress_correlation_id = "ingress-correlation-id-123"
    transcript = "mulch the front beds"
    with pytest.raises(ExtractionError, match="Claude request failed: malformed payload"):
        await extraction_job(
            _worker_context(
                db_session,
                extraction_integration=_MetadataFailureExtractionIntegration(),
            ),
            str(record.id),
            correlation_id=ingress_correlation_id,
            transcript=transcript,
            source_type="text",
            capture_detail="notes",
        )

    refreshed = await _load_job_record(db_session, record.id)
    assert refreshed is not None  # nosec B101 - pytest assertion
    assert refreshed.last_model_id == "claude-haiku-4-5-20251001"  # nosec B101 - pytest assertion

    extraction_failure = next(
        log for log in security_logs if log.get("event") == "quotes.extract_failed"
    )
    assert extraction_failure["job_id"] == str(record.id)  # nosec B101 - pytest assertion
    assert extraction_failure["correlation_id"] == ingress_correlation_id  # nosec B101 - pytest assertion
    assert extraction_failure["last_model_id"] == "claude-haiku-4-5-20251001"  # nosec B101 - pytest assertion
    assert extraction_failure["extraction_invocation_tier"] == "fallback"  # nosec B101 - pytest assertion
    assert extraction_failure["extraction_prompt_variant"] == "fallback_default"  # nosec B101 - pytest assertion
    assert extraction_failure["error_class"] == "_NonRetryableProviderError"  # nosec B101 - pytest assertion
    assert isinstance(extraction_failure["latency_ms"], int)  # nosec B101 - pytest assertion
    assert extraction_failure["token_usage"] == {  # nosec B101 - pytest assertion
        "input_tokens": 91,
        "output_tokens": 0,
    }
    assert (
        extraction_failure["transcript_sha256"]
        == sha256(  # nosec B101 - pytest assertion
            transcript.encode("utf-8")
        ).hexdigest()
    )
    assert transcript not in json.dumps(extraction_failure)  # nosec B101 - pytest assertion


class _SuccessfulExtractionIntegration:
    async def extract(
        self,
        notes: PreparedCaptureInput | str,
        *,
        mode: ExtractionMode = "initial",
    ) -> ExtractionResult:
        del mode
        transcript = _capture_transcript(notes)
        return ExtractionResult(
            transcript=transcript,
            line_items=[],
            pricing_hints=PricingHints(),
            confidence_notes=[],
        )


class _SuccessfulSeededLineItemExtractionIntegration:
    async def extract(
        self,
        notes: PreparedCaptureInput | str,
        *,
        mode: ExtractionMode = "initial",
    ) -> ExtractionResult:
        del mode
        transcript = _capture_transcript(notes)
        return ExtractionResult(
            transcript=transcript,
            line_items=[
                LineItemExtractedV2(
                    raw_text="Initial line item 100",
                    description="Initial line item",
                    details=None,
                    price=100,
                    confidence="medium",
                )
            ],
            pricing_hints=PricingHints(explicit_total=100),
            confidence_notes=[],
        )


class _CaptureInputExtractionIntegration:
    def __init__(self) -> None:
        self.received_inputs: list[PreparedCaptureInput] = []
        self.received_modes: list[ExtractionMode] = []

    async def extract(
        self,
        notes: PreparedCaptureInput | str,
        *,
        mode: ExtractionMode = "initial",
    ) -> ExtractionResult:
        transcript = _capture_transcript(notes)
        self.received_modes.append(mode)
        if isinstance(notes, PreparedCaptureInput):
            self.received_inputs.append(notes)
        return ExtractionResult(
            transcript=transcript,
            line_items=[],
            pricing_hints=PricingHints(),
            confidence_notes=[],
        )


class _AppendCandidateExtractionIntegration:
    async def extract(
        self,
        notes: PreparedCaptureInput | str,
        *,
        mode: ExtractionMode = "initial",
    ) -> ExtractionResult:
        del mode
        transcript = _capture_transcript(notes)
        return ExtractionResult(
            transcript=transcript,
            line_items=[],
            pricing_hints=PricingHints(tax_rate=0.07),
            customer_notes_suggestion=ExtractionSuggestion(
                text="Append note candidate",
                confidence="medium",
                source="leftover_classification",
            ),
            confidence_notes=[],
        )


class _RetryableProviderError(Exception):
    def __init__(self, status_code: int) -> None:
        super().__init__(f"provider error {status_code}")
        self.status_code = status_code


class _RetryableFailureExtractionIntegration:
    async def extract(
        self,
        notes: PreparedCaptureInput | str,
        *,
        mode: ExtractionMode = "initial",
    ) -> ExtractionResult:
        del notes, mode
        raise ExtractionError("Claude request failed: retryable") from _RetryableProviderError(429)


class _ValidationRepairFailedExtractionIntegration:
    model_id = "claude-haiku-4-5-20251001"

    async def extract(
        self,
        notes: PreparedCaptureInput | str,
        *,
        mode: ExtractionMode = "initial",
    ) -> ExtractionResult:
        del mode
        transcript = _capture_transcript(notes)
        return ExtractionResult(
            transcript=transcript,
            line_items=[],
            pricing_hints=PricingHints(),
            confidence_notes=[],
            extraction_tier="degraded",
            extraction_degraded_reason_code="validation_repair_failed",
        )

    def pop_last_call_metadata(self) -> ExtractionCallMetadata:
        return ExtractionCallMetadata(
            model_id=self.model_id,
            token_usage={"input_tokens": 91, "output_tokens": 44},
            repair_attempted=True,
            repair_outcome="repair_invalid",
            repair_validation_error_count=1,
        )


class _NonRetryableFailureExtractionIntegration:
    async def extract(
        self,
        notes: PreparedCaptureInput | str,
        *,
        mode: ExtractionMode = "initial",
    ) -> ExtractionResult:
        del notes, mode
        raise ExtractionError("Claude request failed: malformed payload")


class _NonRetryableProviderError(Exception):
    def __init__(self, status_code: int) -> None:
        super().__init__(f"provider error {status_code}")
        self.status_code = status_code


class _MetadataFailureExtractionIntegration:
    model_id = "claude-haiku-4-5-20251001"

    async def extract(
        self,
        notes: PreparedCaptureInput | str,
        *,
        mode: ExtractionMode = "initial",
    ) -> ExtractionResult:
        del notes, mode
        raise ExtractionError(
            "Claude request failed: malformed payload"
        ) from _NonRetryableProviderError(status_code=400)

    def pop_last_call_metadata(self) -> ExtractionCallMetadata:
        return ExtractionCallMetadata(
            model_id=self.model_id,
            token_usage={"input_tokens": 91, "output_tokens": 0},
            invocation_tier="fallback",
            prompt_variant="fallback_default",
        )


async def _seed_user(db_session: AsyncSession) -> User:
    user = User(
        id=uuid4(),
        email=f"{uuid4().hex}@example.com",
        password_hash="hashed-password",  # nosec B106 - test-only stub value
    )
    db_session.add(user)
    await db_session.flush()
    return user


def _capture_transcript(notes: PreparedCaptureInput | str) -> str:
    if isinstance(notes, PreparedCaptureInput):
        return notes.transcript
    return notes


def _worker_context(
    db_session: AsyncSession,
    *,
    extraction_integration: object,
    job_try: int = 1,
) -> dict[str, object]:
    session_maker = async_sessionmaker(
        bind=db_session.bind,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    runtime = WorkerRuntimeSettings(
        session_maker=session_maker,
        max_tries=3,
        retry_base_seconds=5.0,
        retry_jitter_seconds=3.0,
    )
    return {
        "job_try": job_try,
        "worker_runtime": runtime,
        "extraction_integration": extraction_integration,
    }


async def _load_job_record(db_session: AsyncSession, job_id: UUID) -> JobRecord | None:
    session_maker = async_sessionmaker(
        bind=db_session.bind,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    async with session_maker() as session:
        repository = JobRepository(session)
        return await repository.get_by_id(job_id)
