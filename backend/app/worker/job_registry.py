"""Stable ARQ job registration points for domain-specific background work."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from arq.worker import func

from app.features.jobs.models import JobType
from app.features.jobs.repository import JobRepository
from app.features.quotes.schemas import ExtractionResult
from app.integrations.extraction import ExtractionError, is_retryable_extraction_error
from app.worker.runtime import (
    DEFAULT_MAX_TRIES,
    RetryableJobError,
    WorkerRuntimeSettings,
    process_job,
)

EXTRACTION_JOB_NAME = "jobs.extraction"
PDF_JOB_NAME = "jobs.pdf"
EMAIL_JOB_NAME = "jobs.email"


async def extraction_job(ctx: dict[str, Any], job_id: str, *, transcript: str) -> None:
    """Run durable quote extraction against the transcript prepared by the API."""
    await process_job(
        ctx,
        job_id=UUID(job_id),
        job_type=JobType.EXTRACTION,
        handler=lambda: _extract_quote_data(ctx, transcript),
        on_success=lambda runtime, result: _store_extraction_result(
            runtime,
            job_id=UUID(job_id),
            result=result,
        ),
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


async def _extract_quote_data(
    ctx: dict[str, Any],
    transcript: str,
) -> ExtractionResult:
    extraction_integration = ctx.get("extraction_integration")
    if extraction_integration is None or not hasattr(extraction_integration, "extract"):
        raise RuntimeError("Worker extraction integration is not initialized")

    try:
        return await extraction_integration.extract(transcript)
    except ExtractionError as exc:
        if is_retryable_extraction_error(exc):
            raise RetryableJobError(str(exc)) from exc
        raise


async def _store_extraction_result(
    runtime: WorkerRuntimeSettings,
    *,
    job_id: UUID,
    result: ExtractionResult,
) -> None:
    async with runtime.session_maker() as session:
        repository = JobRepository(session)
        await repository.set_success_with_result(
            job_id,
            result_json=result.model_dump_json(),
            expected_job_type=JobType.EXTRACTION,
        )
        await session.commit()
