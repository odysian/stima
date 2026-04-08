"""Repository tests for durable job-record status transitions."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from app.features.auth.models import User
from app.features.jobs.models import JobRecord, JobStatus, JobType
from app.features.jobs.repository import JobRepository
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio


async def test_job_repository_supports_explicit_status_paths(
    db_session: AsyncSession,
) -> None:
    user = await _seed_user(db_session)
    repository = JobRepository(db_session)

    success_record = await repository.create(user_id=user.id, job_type=JobType.EXTRACTION)
    await repository.set_running(success_record.id, expected_job_type=JobType.EXTRACTION)
    await repository.set_success_with_result(
        success_record.id,
        result_json='{"transcript":"mulch","line_items":[],"total":null,"confidence_notes":[]}',
        expected_job_type=JobType.EXTRACTION,
    )

    failed_record = await repository.create(user_id=user.id, job_type=JobType.PDF)
    await repository.set_running(failed_record.id, expected_job_type=JobType.PDF)
    await repository.set_failed(failed_record.id, expected_job_type=JobType.PDF)
    await repository.set_terminal(
        failed_record.id,
        reason="retry budget exhausted",
        expected_job_type=JobType.PDF,
    )
    await db_session.commit()

    refreshed_success = await repository.get_by_id(success_record.id)
    refreshed_failed = await repository.get_by_id(failed_record.id)

    assert refreshed_success is not None  # nosec B101 - pytest assertion
    assert refreshed_success.status == JobStatus.SUCCESS  # nosec B101 - pytest assertion
    assert refreshed_success.attempts == 1  # nosec B101 - pytest assertion
    assert refreshed_success.result_json is not None  # nosec B101 - pytest assertion

    assert refreshed_failed is not None  # nosec B101 - pytest assertion
    assert refreshed_failed.status == JobStatus.TERMINAL  # nosec B101 - pytest assertion
    assert refreshed_failed.attempts == 1  # nosec B101 - pytest assertion
    assert refreshed_failed.terminal_error == "retry budget exhausted"  # nosec B101 - pytest assertion
    assert refreshed_failed.result_json is None  # nosec B101 - pytest assertion


async def test_job_repository_rejects_invalid_terminal_to_running_transition(
    db_session: AsyncSession,
) -> None:
    user = await _seed_user(db_session)
    repository = JobRepository(db_session)
    record = await repository.create(user_id=user.id, job_type=JobType.EMAIL)
    await repository.set_running(record.id, expected_job_type=JobType.EMAIL)
    await repository.set_failed(record.id, expected_job_type=JobType.EMAIL)
    await repository.set_terminal(
        record.id,
        reason="permanent failure",
        expected_job_type=JobType.EMAIL,
    )

    with pytest.raises(ValueError, match="Invalid job status transition"):
        await repository.set_running(record.id, expected_job_type=JobType.EMAIL)


async def test_job_repository_allows_pending_jobs_to_become_terminal_on_enqueue_failure(
    db_session: AsyncSession,
) -> None:
    user = await _seed_user(db_session)
    repository = JobRepository(db_session)
    record = await repository.create(user_id=user.id, job_type=JobType.EXTRACTION)

    await repository.set_terminal(
        record.id,
        reason="enqueue_failed",
        expected_job_type=JobType.EXTRACTION,
    )
    await db_session.commit()

    refreshed = await repository.get_by_id(record.id)
    assert refreshed is not None  # nosec B101 - pytest assertion
    assert refreshed.status == JobStatus.TERMINAL  # nosec B101 - pytest assertion
    assert refreshed.terminal_error == "enqueue_failed"  # nosec B101 - pytest assertion


async def test_create_extraction_job_with_capacity_limit_rejects_when_at_limit(
    db_session: AsyncSession,
) -> None:
    user = await _seed_user(db_session)
    repository = JobRepository(db_session)

    first = await repository.create_extraction_job_with_capacity_limit(
        user_id=user.id,
        concurrency_limit=1,
    )
    second = await repository.create_extraction_job_with_capacity_limit(
        user_id=user.id,
        concurrency_limit=1,
    )
    await db_session.commit()

    assert first is not None  # nosec B101 - pytest assertion
    assert second is None  # nosec B101 - pytest assertion


async def test_reap_stale_extraction_jobs_terminalizes_only_stale_active_extraction_rows(
    db_session: AsyncSession,
) -> None:
    user = await _seed_user(db_session)
    repository = JobRepository(db_session)
    stale_cutoff = datetime.now(UTC) - timedelta(minutes=5)

    stale_pending = await repository.create(user_id=user.id, job_type=JobType.EXTRACTION)
    stale_pending.created_at = stale_cutoff - timedelta(minutes=1)

    stale_running = await repository.create(user_id=user.id, job_type=JobType.EXTRACTION)
    await repository.set_running(stale_running.id, expected_job_type=JobType.EXTRACTION)
    stale_running.created_at = stale_cutoff - timedelta(minutes=2)

    fresh_pending = await repository.create(user_id=user.id, job_type=JobType.EXTRACTION)
    fresh_pending.created_at = stale_cutoff + timedelta(minutes=1)

    stale_pdf = await repository.create(user_id=user.id, job_type=JobType.PDF)
    stale_pdf.created_at = stale_cutoff - timedelta(minutes=3)

    await db_session.flush()

    reaped_count = await repository.reap_stale_extraction_jobs(
        older_than=stale_cutoff,
        reason="job_not_picked_up",
    )
    await db_session.commit()

    records = {record.id: record for record in (await db_session.scalars(select(JobRecord))).all()}

    assert reaped_count == 2  # nosec B101 - pytest assertion
    assert records[stale_pending.id].status == JobStatus.TERMINAL  # nosec B101 - pytest assertion
    assert records[stale_pending.id].terminal_error == "job_not_picked_up"  # nosec B101 - pytest assertion
    assert records[stale_running.id].status == JobStatus.TERMINAL  # nosec B101 - pytest assertion
    assert records[stale_running.id].terminal_error == "job_not_picked_up"  # nosec B101 - pytest assertion
    assert records[fresh_pending.id].status == JobStatus.PENDING  # nosec B101 - pytest assertion
    assert records[fresh_pending.id].terminal_error is None  # nosec B101 - pytest assertion
    assert records[stale_pdf.id].status == JobStatus.PENDING  # nosec B101 - pytest assertion
    assert records[stale_pdf.id].terminal_error is None  # nosec B101 - pytest assertion


async def _seed_user(db_session: AsyncSession) -> User:
    user = User(
        id=uuid4(),
        email=f"{uuid4().hex}@example.com",
        password_hash="hashed-password",  # nosec B106 - test-only stub value
    )
    db_session.add(user)
    await db_session.flush()
    return user
