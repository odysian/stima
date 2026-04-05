"""Authenticated job-status API endpoints."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.features.auth.models import User
from app.features.jobs.schemas import JobRecordResponse, job_record_to_response
from app.features.jobs.service import JobService
from app.shared.dependencies import get_current_user, get_job_service

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{job_id}", response_model=JobRecordResponse)
async def get_job_status(
    job_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    job_service: Annotated[JobService, Depends(get_job_service)],
) -> JobRecordResponse:
    """Return one user-owned durable job record or a generic 404."""
    record = await job_service.get_job_for_user(job_id=job_id, user_id=user.id)
    if record is None:
        raise HTTPException(status_code=404, detail="Not found")
    return job_record_to_response(record)
