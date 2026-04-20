"""Request and response schemas for line-item catalog endpoints."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def _normalize_required_title(value: str) -> str:
    trimmed = value.strip()
    if not trimmed:
        raise ValueError("title cannot be blank")
    return trimmed


def _normalize_optional_title(value: object) -> object:
    if value is None or not isinstance(value, str):
        return value
    return _normalize_required_title(value)


class LineItemCatalogCreateRequest(BaseModel):
    """Request payload for catalog item creation."""

    title: str = Field(min_length=1, max_length=255)
    details: str | None = None
    default_price: Decimal | None = Field(default=None, ge=0)

    _normalize_title = field_validator("title", mode="before")(_normalize_required_title)


class LineItemCatalogUpdateRequest(BaseModel):
    """Request payload for partial catalog item updates."""

    title: str | None = Field(default=None, min_length=1, max_length=255)
    details: str | None = None
    default_price: Decimal | None = Field(default=None, ge=0)

    _normalize_title = field_validator("title", mode="before")(_normalize_optional_title)

    @model_validator(mode="after")
    def validate_title_is_not_null_when_provided(self) -> LineItemCatalogUpdateRequest:
        """Reject explicit null for title while still allowing omitted field."""
        if "title" in self.model_fields_set and self.title is None:
            raise ValueError("title cannot be null")
        return self


class LineItemCatalogItemResponse(BaseModel):
    """Serializable catalog item payload returned by API endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    details: str | None
    default_price: Decimal | None
    created_at: datetime
    updated_at: datetime
