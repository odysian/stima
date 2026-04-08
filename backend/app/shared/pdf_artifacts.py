"""Shared helpers for durable PDF artifact state and lifecycle decisions."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from app.features.jobs.models import JobStatus

PDF_ARTIFACT_NOT_READY_DETAIL = "PDF artifact not ready"
ACTIVE_PDF_ARTIFACT_JOB_STATUSES = frozenset(
    {JobStatus.PENDING, JobStatus.RUNNING, JobStatus.FAILED}
)


@dataclass(frozen=True, slots=True)
class PdfArtifactState:
    """Resolved durable artifact state surfaced to authenticated detail endpoints."""

    status: Literal["missing", "pending", "ready", "failed"]
    job_id: UUID | None
    terminal_error: str | None


def resolve_pdf_artifact_state(
    *,
    artifact_path: str | None,
    job_id: UUID | None,
    job_status: JobStatus | None,
    terminal_error: str | None,
) -> PdfArtifactState:
    """Map durable storage/job state into the public artifact contract."""
    if artifact_path is not None:
        return PdfArtifactState(status="ready", job_id=None, terminal_error=None)

    if job_id is None or job_status is None:
        return PdfArtifactState(status="missing", job_id=None, terminal_error=None)

    if job_status in ACTIVE_PDF_ARTIFACT_JOB_STATUSES:
        return PdfArtifactState(status="pending", job_id=job_id, terminal_error=None)

    if job_status == JobStatus.TERMINAL:
        return PdfArtifactState(
            status="failed",
            job_id=job_id,
            terminal_error=terminal_error,
        )

    # SUCCESS with no artifact path means the durable pointer is missing or stale.
    # Treat it as "missing" so clients can trigger a fresh render instead of
    # surfacing a misleading ready/failed state for an artifact that cannot load.
    return PdfArtifactState(status="missing", job_id=None, terminal_error=None)
