"""Persistence operations for durable background job records."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.auth.models import User
from app.features.jobs.models import JobRecord, JobStatus, JobType

_ALLOWED_TRANSITIONS: dict[JobStatus, frozenset[JobStatus]] = {
    JobStatus.PENDING: frozenset({JobStatus.RUNNING, JobStatus.TERMINAL}),
    JobStatus.RUNNING: frozenset({JobStatus.SUCCESS, JobStatus.FAILED, JobStatus.TERMINAL}),
    JobStatus.FAILED: frozenset({JobStatus.RUNNING, JobStatus.TERMINAL}),
    JobStatus.SUCCESS: frozenset(),
    JobStatus.TERMINAL: frozenset(),
}


class JobRepository:
    """Create and update durable job records using async SQLAlchemy sessions."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self,
        *,
        user_id: UUID,
        job_type: JobType,
        document_id: UUID | None = None,
        document_revision: int | None = None,
    ) -> JobRecord:
        """Persist a newly enqueued job in pending state."""
        record = JobRecord(
            user_id=user_id,
            document_id=document_id,
            document_revision=document_revision,
            job_type=job_type,
            status=JobStatus.PENDING,
            attempts=0,
        )
        self._session.add(record)
        await self._session.flush()
        await self._session.refresh(record)
        return record

    async def count_active_for_user(
        self,
        *,
        user_id: UUID,
        job_type: JobType,
    ) -> int:
        """Count pending and running jobs of the given type for one user."""
        active_count = await self._session.scalar(
            select(func.count(JobRecord.id)).where(
                JobRecord.user_id == user_id,
                JobRecord.job_type == job_type,
                JobRecord.status.in_((JobStatus.PENDING, JobStatus.RUNNING)),
            )
        )
        return int(active_count or 0)

    async def create_extraction_job_with_capacity_limit(
        self,
        *,
        user_id: UUID,
        concurrency_limit: int,
        document_id: UUID | None = None,
    ) -> JobRecord | None:
        """Atomically create one extraction job when user active-job capacity allows it."""
        user_row = await self._session.scalar(
            select(User.id).where(User.id == user_id).with_for_update()
        )
        if user_row is None:
            raise ValueError(f"User {user_id} does not exist")

        active_count = await self.count_active_for_user(
            user_id=user_id,
            job_type=JobType.EXTRACTION,
        )
        if active_count >= concurrency_limit:
            return None

        return await self.create(
            user_id=user_id,
            job_type=JobType.EXTRACTION,
            document_id=document_id,
        )

    async def reap_stale_extraction_jobs(
        self,
        *,
        older_than: datetime,
        reason: str,
    ) -> int:
        """Mark stale extraction jobs terminal so they stop consuming concurrency."""
        result = await self._session.execute(
            update(JobRecord)
            .where(
                JobRecord.job_type == JobType.EXTRACTION,
                JobRecord.status.in_((JobStatus.PENDING, JobStatus.RUNNING)),
                JobRecord.updated_at < older_than,
            )
            .values(
                status=JobStatus.TERMINAL,
                terminal_error=reason,
                result_json=None,
                updated_at=func.now(),
            )
            .returning(JobRecord.id)
        )
        return len(result.scalars().all())

    async def get_by_id(self, job_id: UUID) -> JobRecord | None:
        """Return one job record by id when it exists."""
        return await self._session.get(JobRecord, job_id)

    async def get_by_id_for_user(self, job_id: UUID, user_id: UUID) -> JobRecord | None:
        """Return one job record owned by the given user."""
        return await self._session.scalar(
            select(JobRecord).where(
                JobRecord.id == job_id,
                JobRecord.user_id == user_id,
            )
        )

    async def set_running(
        self,
        job_id: UUID,
        *,
        expected_job_type: JobType | None = None,
    ) -> JobRecord:
        """Mark a pending or retryable failed job as running and increment attempts."""
        record = await self._get_required(job_id, expected_job_type=expected_job_type)
        self._ensure_transition(record.status, JobStatus.RUNNING)
        record.status = JobStatus.RUNNING
        record.attempts += 1
        record.terminal_error = None
        record.result_json = None
        await self._session.flush()
        await self._session.refresh(record)
        return record

    async def set_failed(
        self,
        job_id: UUID,
        *,
        expected_job_type: JobType | None = None,
    ) -> JobRecord:
        """Mark a running job as failed but still retryable."""
        record = await self._get_required(job_id, expected_job_type=expected_job_type)
        self._ensure_transition(record.status, JobStatus.FAILED)
        record.status = JobStatus.FAILED
        record.terminal_error = None
        record.result_json = None
        await self._session.flush()
        await self._session.refresh(record)
        return record

    async def set_success_with_result(
        self,
        job_id: UUID,
        *,
        result_json: str | None = None,
        expected_job_type: JobType | None = None,
    ) -> JobRecord:
        """Mark a running job as successful and persist any serialized result payload."""
        record = await self._get_required(job_id, expected_job_type=expected_job_type)
        self._ensure_transition(record.status, JobStatus.SUCCESS)
        record.status = JobStatus.SUCCESS
        record.terminal_error = None
        record.result_json = result_json
        await self._session.flush()
        await self._session.refresh(record)
        return record

    async def set_extraction_success(
        self,
        job_id: UUID,
        *,
        quote_id: UUID,
        result_json: str,
        expected_job_type: JobType = JobType.EXTRACTION,
    ) -> JobRecord:
        """Mark an extraction job successful and attach the persisted quote id."""
        record = await self._get_required(job_id, expected_job_type=expected_job_type)
        self._ensure_transition(record.status, JobStatus.SUCCESS)
        record.status = JobStatus.SUCCESS
        record.document_id = quote_id
        record.terminal_error = None
        record.result_json = result_json
        await self._session.flush()
        await self._session.refresh(record)
        return record

    async def set_success(
        self,
        job_id: UUID,
        *,
        expected_job_type: JobType | None = None,
    ) -> JobRecord:
        """Mark a running job as successful without persisting a result payload."""
        return await self.set_success_with_result(
            job_id,
            result_json=None,
            expected_job_type=expected_job_type,
        )

    async def set_terminal(
        self,
        job_id: UUID,
        *,
        reason: str,
        expected_job_type: JobType | None = None,
    ) -> JobRecord:
        """Mark a pending, failed, or running job as terminal with a durable reason."""
        record = await self._get_required(job_id, expected_job_type=expected_job_type)
        self._ensure_transition(record.status, JobStatus.TERMINAL)
        record.status = JobStatus.TERMINAL
        record.terminal_error = reason
        record.result_json = None
        await self._session.flush()
        await self._session.refresh(record)
        return record

    async def _get_required(
        self,
        job_id: UUID,
        *,
        expected_job_type: JobType | None = None,
    ) -> JobRecord:
        record = await self.get_by_id(job_id)
        if record is None:
            raise ValueError(f"JobRecord {job_id} does not exist")
        if expected_job_type is not None and record.job_type != expected_job_type:
            raise ValueError(
                f"JobRecord {job_id} is {record.job_type.value}, expected {expected_job_type.value}"
            )
        return record

    def _ensure_transition(self, current: JobStatus, target: JobStatus) -> None:
        allowed_targets = _ALLOWED_TRANSITIONS[current]
        if target not in allowed_targets:
            raise ValueError(f"Invalid job status transition: {current.value} -> {target.value}")
