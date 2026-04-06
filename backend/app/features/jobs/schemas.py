"""Serializable job status schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.features.jobs.models import JobRecord, JobStatus, JobType
from app.features.quotes.schemas import ExtractionResult


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
    extraction_result: ExtractionResult | None = None
    created_at: datetime
    updated_at: datetime


def job_record_to_response(record: JobRecord) -> JobRecordResponse:
    """Serialize durable job records, decoding extraction results when present."""
    response = JobRecordResponse.model_validate(record)
    if (
        record.job_type != JobType.EXTRACTION
        or record.status != JobStatus.SUCCESS
        or record.result_json is None
    ):
        return response
    return response.model_copy(
        update={"extraction_result": ExtractionResult.model_validate_json(record.result_json)}
    )
