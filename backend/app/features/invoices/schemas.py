"""Request/response schemas for invoice endpoints."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.features.quotes.schemas import LineItemDraft, LineItemResponse


def _normalize_optional_title(value: object) -> object:
    """Trim optional title values and collapse blanks to null."""
    if value is None or not isinstance(value, str):
        return value
    trimmed = value.strip()
    return trimmed or None


class InvoiceCreateRequest(BaseModel):
    """Request payload for creating a direct invoice from the shared builder."""

    customer_id: UUID
    title: str | None = Field(default=None, max_length=120)
    transcript: str = Field(min_length=1)
    line_items: list[LineItemDraft] = Field(default_factory=list)
    total_amount: float | None = None
    notes: str | None = None
    source_type: Literal["text", "voice"]

    _normalize_title = field_validator("title", mode="before")(_normalize_optional_title)


class InvoiceResponse(BaseModel):
    """Serializable invoice payload returned by invoice endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    customer_id: UUID
    doc_number: str
    title: str | None
    status: Literal["draft", "ready", "sent"]
    total_amount: float | None
    notes: str | None
    due_date: date | None
    shared_at: datetime | None
    share_token: str | None
    source_document_id: UUID | None
    line_items: list[LineItemResponse]
    created_at: datetime
    updated_at: datetime


class InvoiceCustomerResponse(BaseModel):
    """Customer summary embedded in invoice detail responses."""

    id: UUID
    name: str
    email: str | None
    phone: str | None


class InvoiceDetailResponse(InvoiceResponse):
    """Detailed invoice payload including source quote and customer fields."""

    source_quote_number: str | None
    customer: InvoiceCustomerResponse


class InvoiceUpdateRequest(BaseModel):
    """Request payload for lightweight invoice updates."""

    due_date: date
