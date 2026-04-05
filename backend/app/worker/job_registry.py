"""Stable ARQ job registration points for domain-specific background work."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from arq.worker import func

from app.features.jobs.models import JobType
from app.worker.runtime import DEFAULT_MAX_TRIES, process_job

EXTRACTION_JOB_NAME = "jobs.extraction"
PDF_JOB_NAME = "jobs.pdf"
EMAIL_JOB_NAME = "jobs.email"


async def extraction_job(ctx: dict[str, Any], job_id: str) -> None:
    """Placeholder extraction job entrypoint for Task 6b."""
    await process_job(
        ctx,
        job_id=UUID(job_id),
        job_type=JobType.EXTRACTION,
        handler=lambda: _raise_not_implemented(JobType.EXTRACTION),
    )


async def pdf_job(ctx: dict[str, Any], job_id: str) -> None:
    """Placeholder PDF job entrypoint for Task 6c."""
    await process_job(
        ctx,
        job_id=UUID(job_id),
        job_type=JobType.PDF,
        handler=lambda: _raise_not_implemented(JobType.PDF),
    )


async def email_job(ctx: dict[str, Any], job_id: str) -> None:
    """Placeholder email job entrypoint for Task 6d."""
    await process_job(
        ctx,
        job_id=UUID(job_id),
        job_type=JobType.EMAIL,
        handler=lambda: _raise_not_implemented(JobType.EMAIL),
    )


def registered_functions() -> list[Any]:
    """Return the stable ARQ function registry for the worker process."""
    return [
        func(extraction_job, name=EXTRACTION_JOB_NAME, max_tries=DEFAULT_MAX_TRIES),
        func(pdf_job, name=PDF_JOB_NAME, max_tries=DEFAULT_MAX_TRIES),
        func(email_job, name=EMAIL_JOB_NAME, max_tries=DEFAULT_MAX_TRIES),
    ]


async def _raise_not_implemented(job_type: JobType) -> None:
    raise NotImplementedError(
        f"{job_type.value} jobs are not wired yet; wait for the corresponding domain task"
    )
