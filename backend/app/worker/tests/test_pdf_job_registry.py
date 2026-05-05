"""PDF job registry tests for retry and terminal-failure semantics."""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from app.features.auth.models import User
from app.features.customers.models import Customer
from app.features.jobs.models import JobRecord, JobStatus, JobType
from app.features.jobs.repository import JobRepository
from app.features.quotes.models import Document, LineItem, QuoteStatus
from app.integrations.pdf import PdfRenderUnexpectedError, PdfRenderValidationError
from app.worker.job_registry import (
    TERMINAL_ERROR_MISSING_DOCUMENT_ID,
    TERMINAL_ERROR_STALE_DOCUMENT_REVISION,
    _get_storage_service,
    pdf_job,
)
from app.worker.pdf_repository import PersistedPdfArtifactResult, WorkerPdfRepository
from app.worker.runtime import (
    TERMINAL_ERROR_RETRY_EXHAUSTED,
    TERMINAL_ERROR_UNEXPECTED,
    NonRetryableJobError,
    WorkerRuntimeSettings,
)
from arq.worker import Retry
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

pytestmark = pytest.mark.asyncio


async def test_pdf_job_marks_success_on_render_completion(
    db_session: AsyncSession,
) -> None:
    user, document = await _seed_quote_document(db_session)
    job_record = await _seed_pdf_job(db_session, user_id=user.id, document_id=document.id)

    await pdf_job(
        _worker_context(
            db_session,
            pdf_integration=_SuccessfulPdfIntegration(),
        ),
        str(job_record.id),
    )

    refreshed = await _load_job_record(db_session, job_record.id)
    assert refreshed is not None  # nosec B101 - pytest assertion
    assert refreshed.status == JobStatus.SUCCESS  # nosec B101 - pytest assertion
    assert refreshed.terminal_error is None  # nosec B101 - pytest assertion


async def test_pdf_job_marks_success_for_invoice_render_context_dispatch(
    db_session: AsyncSession,
) -> None:
    user, invoice = await _seed_invoice_document(db_session)
    job_record = await _seed_pdf_job(db_session, user_id=user.id, document_id=invoice.id)

    await pdf_job(
        _worker_context(
            db_session,
            pdf_integration=_SuccessfulPdfIntegration(),
        ),
        str(job_record.id),
    )

    refreshed = await _load_job_record(db_session, job_record.id)
    assert refreshed is not None  # nosec B101 - pytest assertion
    assert refreshed.status == JobStatus.SUCCESS  # nosec B101 - pytest assertion
    assert refreshed.terminal_error is None  # nosec B101 - pytest assertion


async def test_pdf_job_retries_transient_render_failure_then_marks_retry_exhausted(
    db_session: AsyncSession,
) -> None:
    user, document = await _seed_quote_document(db_session)
    job_record = await _seed_pdf_job(db_session, user_id=user.id, document_id=document.id)

    failing_pdf_integration = _RetryableFailurePdfIntegration()

    with pytest.raises(Retry):
        await pdf_job(
            _worker_context(
                db_session,
                job_try=1,
                pdf_integration=failing_pdf_integration,
            ),
            str(job_record.id),
        )

    after_first_failure = await _load_job_record(db_session, job_record.id)
    assert after_first_failure is not None  # nosec B101 - pytest assertion
    assert after_first_failure.status == JobStatus.FAILED  # nosec B101 - pytest assertion

    with pytest.raises(NonRetryableJobError, match=TERMINAL_ERROR_RETRY_EXHAUSTED):
        await pdf_job(
            _worker_context(
                db_session,
                job_try=3,
                pdf_integration=failing_pdf_integration,
            ),
            str(job_record.id),
        )

    terminal_record = await _load_job_record(db_session, job_record.id)
    assert terminal_record is not None  # nosec B101 - pytest assertion
    assert terminal_record.status == JobStatus.TERMINAL  # nosec B101 - pytest assertion
    assert terminal_record.terminal_error == TERMINAL_ERROR_RETRY_EXHAUSTED  # nosec B101 - pytest assertion


async def test_pdf_job_marks_terminal_for_non_retryable_render_error(
    db_session: AsyncSession,
) -> None:
    user, document = await _seed_quote_document(db_session)
    job_record = await _seed_pdf_job(db_session, user_id=user.id, document_id=document.id)

    with pytest.raises(NonRetryableJobError):
        await pdf_job(
            _worker_context(
                db_session,
                pdf_integration=_ValidationFailurePdfIntegration(),
            ),
            str(job_record.id),
        )

    terminal_record = await _load_job_record(db_session, job_record.id)
    assert terminal_record is not None  # nosec B101 - pytest assertion
    assert terminal_record.status == JobStatus.TERMINAL  # nosec B101 - pytest assertion
    assert terminal_record.terminal_error == TERMINAL_ERROR_UNEXPECTED  # nosec B101 - pytest assertion


async def test_pdf_job_marks_terminal_when_render_returns_invalid_payload_type(
    db_session: AsyncSession,
) -> None:
    user, document = await _seed_quote_document(db_session)
    job_record = await _seed_pdf_job(db_session, user_id=user.id, document_id=document.id)

    with pytest.raises(NonRetryableJobError):
        await pdf_job(
            _worker_context(
                db_session,
                pdf_integration=_InvalidPayloadPdfIntegration(),
            ),
            str(job_record.id),
        )

    terminal_record = await _load_job_record(db_session, job_record.id)
    assert terminal_record is not None  # nosec B101 - pytest assertion
    assert terminal_record.status == JobStatus.TERMINAL  # nosec B101 - pytest assertion
    assert terminal_record.terminal_error == TERMINAL_ERROR_UNEXPECTED  # nosec B101 - pytest assertion


async def test_pdf_job_marks_terminal_when_document_id_missing(
    db_session: AsyncSession,
) -> None:
    user = await _seed_user(db_session)
    job_record = await _seed_pdf_job(db_session, user_id=user.id, document_id=None)

    with pytest.raises(NonRetryableJobError):
        await pdf_job(
            _worker_context(
                db_session,
                pdf_integration=_SuccessfulPdfIntegration(),
            ),
            str(job_record.id),
        )

    terminal_record = await _load_job_record(db_session, job_record.id)
    assert terminal_record is not None  # nosec B101 - pytest assertion
    assert terminal_record.status == JobStatus.TERMINAL  # nosec B101 - pytest assertion
    assert terminal_record.terminal_error == TERMINAL_ERROR_MISSING_DOCUMENT_ID  # nosec B101 - pytest assertion


async def test_pdf_job_attaches_logo_data_uri_when_logo_exists(
    db_session: AsyncSession,
) -> None:
    user, document = await _seed_quote_document(
        db_session,
        logo_path="logos/user.png",
    )
    job_record = await _seed_pdf_job(db_session, user_id=user.id, document_id=document.id)
    pdf_integration = _CapturingPdfIntegration()

    await pdf_job(
        _worker_context(
            db_session,
            pdf_integration=pdf_integration,
            storage_service=_LogoStorageService(),
        ),
        str(job_record.id),
    )

    refreshed = await _load_job_record(db_session, job_record.id)
    assert refreshed is not None  # nosec B101 - pytest assertion
    assert refreshed.status == JobStatus.SUCCESS  # nosec B101 - pytest assertion
    assert pdf_integration.last_logo_data_uri is not None  # nosec B101 - pytest assertion
    assert pdf_integration.last_logo_data_uri.startswith("data:image/png;base64,")  # nosec B101 - pytest assertion


async def test_pdf_job_discards_stale_revision_and_newer_job_succeeds(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user, document = await _seed_quote_document(db_session)
    stale_job = await _seed_pdf_job(db_session, user_id=user.id, document_id=document.id)
    storage_service = _RecordingStorageService()

    original_persist = WorkerPdfRepository.persist_generated_artifact
    stale_applied = False

    async def _persist_with_forced_stale_result(
        self: WorkerPdfRepository,
        *,
        document_id: UUID,
        user_id: UUID,
        job_id: UUID,
        expected_revision: int,
        artifact_path: str,
    ) -> PersistedPdfArtifactResult:
        nonlocal stale_applied
        if not stale_applied:
            stale_applied = True
            stale_document = await self._session.get(Document, document_id)
            assert stale_document is not None  # nosec B101 - pytest assertion
            stale_document.pdf_artifact_revision = stale_document.pdf_artifact_revision + 1
            await self._session.flush()
            return PersistedPdfArtifactResult(
                applied=False,
                previous_path=stale_document.pdf_artifact_path,
            )
        return await original_persist(
            self,
            document_id=document_id,
            user_id=user_id,
            job_id=job_id,
            expected_revision=expected_revision,
            artifact_path=artifact_path,
        )

    monkeypatch.setattr(
        WorkerPdfRepository,
        "persist_generated_artifact",
        _persist_with_forced_stale_result,
    )

    with pytest.raises(NonRetryableJobError):
        await pdf_job(
            _worker_context(
                db_session,
                pdf_integration=_SuccessfulPdfIntegration(),
                storage_service=storage_service,
            ),
            str(stale_job.id),
        )

    stale_record = await _load_job_record(db_session, stale_job.id)
    assert stale_record is not None  # nosec B101 - pytest assertion
    assert stale_record.status == JobStatus.TERMINAL  # nosec B101 - pytest assertion
    assert stale_record.terminal_error == TERMINAL_ERROR_STALE_DOCUMENT_REVISION  # nosec B101 - pytest assertion

    fresh_job = await _seed_pdf_job(db_session, user_id=user.id, document_id=document.id)
    await pdf_job(
        _worker_context(
            db_session,
            pdf_integration=_SuccessfulPdfIntegration(),
            storage_service=storage_service,
        ),
        str(fresh_job.id),
    )

    fresh_record = await _load_job_record(db_session, fresh_job.id)
    assert fresh_record is not None  # nosec B101 - pytest assertion
    assert fresh_record.status == JobStatus.SUCCESS  # nosec B101 - pytest assertion
    assert len(storage_service.deleted_paths) == 1  # nosec B101 - pytest assertion


async def test_get_storage_service_rejects_runtime_without_delete_method() -> None:
    class _MissingDeleteStorageService:
        def fetch_bytes(self, object_path: str) -> bytes:
            del object_path
            return b""

        def upload(
            self,
            *,
            prefix: str,
            filename: str,
            data: bytes,
            content_type: str,
        ) -> str:
            del prefix, filename, data, content_type
            return "artifacts/path.pdf"

    with pytest.raises(RuntimeError, match="Worker storage service is not initialized"):
        _get_storage_service({"storage_service": _MissingDeleteStorageService()})


class _SuccessfulPdfIntegration:
    def render(self, context: object) -> bytes:
        del context
        return b"%PDF-1.7"


class _RetryableFailurePdfIntegration:
    def render(self, context: object) -> bytes:
        del context
        raise PdfRenderUnexpectedError("Temporary renderer outage")


class _ValidationFailurePdfIntegration:
    def render(self, context: object) -> bytes:
        del context
        raise PdfRenderValidationError("Document exceeds supported render limits")


class _InvalidPayloadPdfIntegration:
    def render(self, context: object) -> object:
        del context
        return None


class _CapturingPdfIntegration:
    def __init__(self) -> None:
        self.last_logo_data_uri: str | None = None

    def render(self, context: object) -> bytes:
        self.last_logo_data_uri = getattr(context, "logo_data_uri", None)
        return b"%PDF-1.7"


class _StubStorageService:
    def fetch_bytes(self, object_path: str) -> bytes:
        raise AssertionError(f"Unexpected storage read in test: {object_path}")

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


class _LogoStorageService:
    _PNG_BYTES = b"\x89PNG\r\n\x1a\n\x00\x00\x00\x00IEND\xaeB`\x82"

    def fetch_bytes(self, object_path: str) -> bytes:
        assert object_path == "logos/user.png"  # nosec B101 - pytest assertion
        return self._PNG_BYTES

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


class _RecordingStorageService(_StubStorageService):
    def __init__(self) -> None:
        self.deleted_paths: list[str] = []

    def delete(self, object_path: str) -> None:
        self.deleted_paths.append(object_path)


async def _seed_user(db_session: AsyncSession) -> User:
    user = User(
        id=uuid4(),
        email=f"{uuid4().hex}@example.com",
        password_hash="hashed-password",  # nosec B106 - test-only stub value
    )
    db_session.add(user)
    await db_session.flush()
    return user


async def _seed_quote_document(
    db_session: AsyncSession,
    *,
    logo_path: str | None = None,
) -> tuple[User, Document]:
    user = await _seed_user(db_session)
    if logo_path is not None:
        user.logo_path = logo_path
    customer = Customer(
        id=uuid4(),
        user_id=user.id,
        name="Acme Customer",
        email="customer@example.com",
    )
    db_session.add(customer)
    await db_session.flush()

    document = Document(
        id=uuid4(),
        user_id=user.id,
        customer_id=customer.id,
        doc_type="quote",
        doc_sequence=1,
        doc_number="Q-0001",
        status=QuoteStatus.DRAFT,
        source_type="text",
        transcript="Render this quote",
    )
    db_session.add(document)
    await db_session.flush()

    db_session.add(
        LineItem(
            id=uuid4(),
            document_id=document.id,
            description="Mulch front yard",
            details="Triple shredded mulch",
            sort_order=0,
        )
    )
    await db_session.flush()
    return user, document


async def _seed_invoice_document(db_session: AsyncSession) -> tuple[User, Document]:
    user = await _seed_user(db_session)
    customer = Customer(
        id=uuid4(),
        user_id=user.id,
        name="Acme Customer",
        email="customer@example.com",
    )
    db_session.add(customer)
    await db_session.flush()

    document = Document(
        id=uuid4(),
        user_id=user.id,
        customer_id=customer.id,
        doc_type="invoice",
        doc_sequence=1,
        doc_number="I-0001",
        status=QuoteStatus.DRAFT,
        source_type="text",
        transcript="Render this invoice",
    )
    db_session.add(document)
    await db_session.flush()

    db_session.add(
        LineItem(
            id=uuid4(),
            document_id=document.id,
            description="Install pavers",
            details="Walkway section",
            sort_order=0,
        )
    )
    await db_session.flush()
    return user, document


async def _seed_pdf_job(
    db_session: AsyncSession,
    *,
    user_id: UUID,
    document_id: UUID | None,
) -> JobRecord:
    document_revision: int | None = None
    if document_id is not None:
        document = await db_session.get(Document, document_id)
        assert document is not None  # nosec B101 - pytest assertion
        document_revision = document.pdf_artifact_revision

    repository = JobRepository(db_session)
    record = await repository.create(
        user_id=user_id,
        job_type=JobType.PDF,
        document_id=document_id,
        document_revision=document_revision,
    )
    await db_session.commit()
    return record


def _worker_context(
    db_session: AsyncSession,
    *,
    job_try: int = 1,
    pdf_integration: object,
    storage_service: object | None = None,
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
        "pdf_integration": pdf_integration,
        "storage_service": storage_service or _StubStorageService(),
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
