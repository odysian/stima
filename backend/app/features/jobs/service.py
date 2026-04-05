"""Service helpers for durable job lifecycle orchestration."""

from __future__ import annotations

from dataclasses import dataclass
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
    ) -> JobRecord:
        """Persist a new pending job row."""
        return await self.repository.create(user_id=user_id, job_type=job_type)

    async def count_active_extraction_jobs(self, user_id: UUID) -> int:
        """Count active extraction jobs for one user."""
        return await self.repository.count_active_for_user(
            user_id=user_id,
            job_type=JobType.EXTRACTION,
        )

    async def get_job_for_user(self, *, job_id: UUID, user_id: UUID) -> JobRecord | None:
        """Return one durable job record when the caller owns it."""
        return await self.repository.get_by_id_for_user(job_id, user_id)

    async def mark_enqueue_failed(self, job_id: UUID) -> JobRecord:
        """Finalize a newly created pending extraction job when queue submission fails."""
        return await self.repository.set_terminal(
            job_id,
            reason="enqueue_failed",
            expected_job_type=JobType.EXTRACTION,
        )
