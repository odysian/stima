"""Request/response schemas for customer endpoints."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CustomerCreateRequest(BaseModel):
    """Request payload for customer creation."""

    name: str = Field(min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=320)
    address: str | None = None


class CustomerUpdateRequest(BaseModel):
    """Request payload for partial customer updates."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=320)
    address: str | None = None


class CustomerResponse(BaseModel):
    """Serializable customer payload returned by customer endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    phone: str | None
    email: str | None
    address: str | None
    created_at: datetime
    updated_at: datetime
