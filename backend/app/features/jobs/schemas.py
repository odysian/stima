"""Serializable job status schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.features.jobs.models import JobRecord, JobStatus, JobType
from app.features.quotes.schemas import (
    ExtractionResult,
    project_extraction_result_for_public_response,
)


class JobRecordResponse(BaseModel):
    """Serializable durable job status contract."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    document_id: UUID | None
    document_revision: int | None
    job_type: JobType
    status: JobStatus
    attempts: int
    terminal_error: str | None
    extraction_result: ExtractionResult | None = None
    quote_id: UUID | None = None
    created_at: datetime
    updated_at: datetime


def job_record_to_response(record: JobRecord) -> JobRecordResponse:
    """Serialize durable job records, decoding extraction results when present."""
    response = JobRecordResponse.model_validate(record)
    if record.job_type != JobType.EXTRACTION:
        return response

    updates: dict[str, UUID | ExtractionResult | None] = {
        "quote_id": record.document_id if record.status == JobStatus.SUCCESS else None
    }
    if record.status == JobStatus.SUCCESS and record.result_json is not None:
        updates["extraction_result"] = project_extraction_result_for_public_response(
            ExtractionResult.model_validate_json(record.result_json)
        )
    return response.model_copy(update=updates)
