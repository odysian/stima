"""Serializable job status schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.features.jobs.models import JobStatus, JobType


class JobRecordResponse(BaseModel):
    """Serializable durable job status contract."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    document_id: UUID | None
    job_type: JobType
    status: JobStatus
    attempts: int
    terminal_error: str | None
    created_at: datetime
    updated_at: datetime
