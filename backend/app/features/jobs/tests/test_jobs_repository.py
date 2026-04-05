"""Repository tests for durable job-record status transitions."""

from __future__ import annotations

from uuid import uuid4

import pytest
from app.features.auth.models import User
from app.features.jobs.models import JobStatus, JobType
from app.features.jobs.repository import JobRepository
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio


async def test_job_repository_supports_explicit_status_paths(
    db_session: AsyncSession,
) -> None:
    user = await _seed_user(db_session)
    repository = JobRepository(db_session)

    success_record = await repository.create(user_id=user.id, job_type=JobType.EXTRACTION)
    await repository.set_running(success_record.id, expected_job_type=JobType.EXTRACTION)
    await repository.set_success(success_record.id, expected_job_type=JobType.EXTRACTION)

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

    assert refreshed_failed is not None  # nosec B101 - pytest assertion
    assert refreshed_failed.status == JobStatus.TERMINAL  # nosec B101 - pytest assertion
    assert refreshed_failed.attempts == 1  # nosec B101 - pytest assertion
    assert refreshed_failed.terminal_error == "retry budget exhausted"  # nosec B101 - pytest assertion


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


async def _seed_user(db_session: AsyncSession) -> User:
    user = User(
        id=uuid4(),
        email=f"{uuid4().hex}@example.com",
        password_hash="hashed-password",  # nosec B106 - test-only stub value
    )
    db_session.add(user)
    await db_session.flush()
    return user
