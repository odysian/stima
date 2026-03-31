"""Request/response schemas for invoice endpoints."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.features.quotes.schemas import LineItemResponse


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
    source_document_id: UUID
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

    source_quote_number: str
    customer: InvoiceCustomerResponse


class InvoiceUpdateRequest(BaseModel):
    """Request payload for lightweight invoice updates."""

    due_date: date
