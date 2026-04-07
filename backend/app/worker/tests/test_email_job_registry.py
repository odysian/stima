"""Email job registry tests for worker-side retry and duplicate-guard bypass semantics."""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from app.features.auth.models import User
from app.features.customers.models import Customer
from app.features.event_logs.models import EventLog
from app.features.jobs.models import JobRecord, JobStatus, JobType
from app.features.jobs.repository import JobRepository
from app.features.quotes.models import Document, QuoteStatus
from app.integrations.email import EmailMessage, EmailSendError
from app.worker.job_registry import email_job
from app.worker.runtime import WorkerRuntimeSettings
from arq.worker import Retry
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

pytestmark = pytest.mark.asyncio


async def test_email_job_succeeds_even_when_recent_email_sent_event_exists(
    db_session: AsyncSession,
) -> None:
    user, document = await _seed_quote_document(db_session)
    db_session.add(
        EventLog(
            user_id=user.id,
            event_name="email_sent",
            metadata_json={"quote_id": str(document.id), "customer_id": str(document.customer_id)},
        )
    )
    await db_session.flush()
    job_record = await _seed_email_job(db_session, user_id=user.id, document_id=document.id)

    email_service = _FlakyEmailService(failures_before_success=0)
    await email_job(
        _worker_context(
            db_session,
            email_service=email_service,
            job_try=1,
        ),
        str(job_record.id),
    )

    refreshed = await _load_job_record(db_session, job_record.id)
    assert refreshed is not None  # nosec B101 - pytest assertion
    assert refreshed.status == JobStatus.SUCCESS  # nosec B101 - pytest assertion
    assert email_service.send_calls == 1  # nosec B101 - pytest assertion


async def test_email_job_retry_path_is_not_blocked_by_duplicate_send_guard(
    db_session: AsyncSession,
) -> None:
    user, document = await _seed_quote_document(db_session)
    db_session.add(
        EventLog(
            user_id=user.id,
            event_name="email_sent",
            metadata_json={"quote_id": str(document.id), "customer_id": str(document.customer_id)},
        )
    )
    await db_session.flush()
    job_record = await _seed_email_job(db_session, user_id=user.id, document_id=document.id)

    email_service = _FlakyEmailService(failures_before_success=1)

    with pytest.raises(Retry):
        await email_job(
            _worker_context(
                db_session,
                email_service=email_service,
                job_try=1,
            ),
            str(job_record.id),
        )

    after_first_attempt = await _load_job_record(db_session, job_record.id)
    assert after_first_attempt is not None  # nosec B101 - pytest assertion
    assert after_first_attempt.status == JobStatus.FAILED  # nosec B101 - pytest assertion

    await email_job(
        _worker_context(
            db_session,
            email_service=email_service,
            job_try=2,
        ),
        str(job_record.id),
    )

    refreshed = await _load_job_record(db_session, job_record.id)
    assert refreshed is not None  # nosec B101 - pytest assertion
    assert refreshed.status == JobStatus.SUCCESS  # nosec B101 - pytest assertion
    assert email_service.send_calls == 2  # nosec B101 - pytest assertion


async def test_invoice_email_job_succeeds_even_when_recent_email_sent_event_exists(
    db_session: AsyncSession,
) -> None:
    user, document = await _seed_invoice_document(db_session)
    db_session.add(
        EventLog(
            user_id=user.id,
            event_name="email_sent",
            metadata_json={
                "invoice_id": str(document.id),
                "customer_id": str(document.customer_id),
            },
        )
    )
    await db_session.flush()
    job_record = await _seed_email_job(db_session, user_id=user.id, document_id=document.id)

    email_service = _FlakyEmailService(failures_before_success=0)
    await email_job(
        _worker_context(
            db_session,
            email_service=email_service,
            job_try=1,
        ),
        str(job_record.id),
    )

    refreshed = await _load_job_record(db_session, job_record.id)
    assert refreshed is not None  # nosec B101 - pytest assertion
    assert refreshed.status == JobStatus.SUCCESS  # nosec B101 - pytest assertion
    assert email_service.send_calls == 1  # nosec B101 - pytest assertion


class _FlakyEmailService:
    def __init__(self, *, failures_before_success: int) -> None:
        self._failures_before_success = failures_before_success
        self.send_calls = 0

    async def send(self, message: EmailMessage) -> None:
        del message
        self.send_calls += 1
        if self.send_calls <= self._failures_before_success:
            raise EmailSendError("provider unavailable")


async def _seed_quote_document(db_session: AsyncSession) -> tuple[User, Document]:
    user = User(
        id=uuid4(),
        email=f"{uuid4().hex}@example.com",
        password_hash="hashed-password",  # nosec B106 - test-only stub value
        business_name="Summit Exterior Care",
        first_name="Jane",
        last_name="Doe",
    )
    db_session.add(user)
    await db_session.flush()

    customer = Customer(
        id=uuid4(),
        user_id=user.id,
        name="Acme Customer",
        email="customer@example.com",
    )
    db_session.add(customer)
    await db_session.flush()

    share_token = f"quote-share-{uuid4().hex}"
    document = Document(
        id=uuid4(),
        user_id=user.id,
        customer_id=customer.id,
        doc_type="quote",
        doc_sequence=1,
        doc_number="Q-0001",
        status=QuoteStatus.SHARED,
        source_type="text",
        transcript="Deliver quote by email",
        share_token=share_token,
    )
    db_session.add(document)
    await db_session.flush()

    return user, document


async def _seed_invoice_document(db_session: AsyncSession) -> tuple[User, Document]:
    user = User(
        id=uuid4(),
        email=f"{uuid4().hex}@example.com",
        password_hash="hashed-password",  # nosec B106 - test-only stub value
        business_name="Summit Exterior Care",
        first_name="Jane",
        last_name="Doe",
    )
    db_session.add(user)
    await db_session.flush()

    customer = Customer(
        id=uuid4(),
        user_id=user.id,
        name="Acme Customer",
        email="customer@example.com",
    )
    db_session.add(customer)
    await db_session.flush()

    share_token = f"invoice-share-{uuid4().hex}"
    document = Document(
        id=uuid4(),
        user_id=user.id,
        customer_id=customer.id,
        doc_type="invoice",
        doc_sequence=1,
        doc_number="I-0001",
        status=QuoteStatus.SENT,
        source_type="text",
        transcript="Deliver invoice by email",
        share_token=share_token,
    )
    db_session.add(document)
    await db_session.flush()

    return user, document


async def _seed_email_job(
    db_session: AsyncSession,
    *,
    user_id: UUID,
    document_id: UUID,
) -> JobRecord:
    repository = JobRepository(db_session)
    record = await repository.create(
        user_id=user_id,
        job_type=JobType.EMAIL,
        document_id=document_id,
    )
    await db_session.commit()
    return record


def _worker_context(
    db_session: AsyncSession,
    *,
    email_service: object,
    job_try: int,
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
        "email_service": email_service,
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
