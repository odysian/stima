"""Service helpers for durable job lifecycle orchestration."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from app.features.jobs.models import JobRecord, JobType
from app.features.jobs.repository import JobRepository


@dataclass(slots=True)
class JobService:
    """Coordinate user-facing durable job operations."""

    repository: JobRepository

    async def create_job(
        self,
        *,
        user_id: UUID,
        job_type: JobType,
        document_id: UUID | None = None,
        document_revision: int | None = None,
    ) -> JobRecord:
        """Persist a new pending job row."""
        return await self.repository.create(
            user_id=user_id,
            job_type=job_type,
            document_id=document_id,
            document_revision=document_revision,
        )

    async def count_active_extraction_jobs(self, user_id: UUID) -> int:
        """Count active extraction jobs for one user."""
        return await self.repository.count_active_for_user(
            user_id=user_id,
            job_type=JobType.EXTRACTION,
        )

    async def create_extraction_job_if_capacity_available(
        self,
        *,
        user_id: UUID,
        concurrency_limit: int,
        document_id: UUID | None = None,
    ) -> JobRecord | None:
        """Create one pending extraction job only when the user is below the active-job cap."""
        return await self.repository.create_extraction_job_with_capacity_limit(
            user_id=user_id,
            concurrency_limit=concurrency_limit,
            document_id=document_id,
        )

    async def get_job_for_user(self, *, job_id: UUID, user_id: UUID) -> JobRecord | None:
        """Return one durable job record when the caller owns it."""
        return await self.repository.get_by_id_for_user(job_id, user_id)

    async def mark_enqueue_failed(self, job_id: UUID, *, job_type: JobType) -> JobRecord:
        """Finalize a newly created pending job when queue submission fails."""
        return await self.repository.set_terminal(
            job_id,
            reason="enqueue_failed",
            expected_job_type=job_type,
        )

    async def reap_stale_extraction_jobs(
        self,
        *,
        older_than: datetime,
        reason: str,
    ) -> int:
        """Finalize stale extraction jobs so users can retry instead of polling forever."""
        return await self.repository.reap_stale_extraction_jobs(
            older_than=older_than,
            reason=reason,
        )
