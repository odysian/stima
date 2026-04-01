"""Request/response schemas for invoice endpoints."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.features.quotes.schemas import DiscountType, LineItemDraft, LineItemResponse


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
    tax_rate: float | None = None
    discount_type: DiscountType | None = None
    discount_value: float | None = None
    deposit_amount: float | None = None
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
    tax_rate: float | None
    discount_type: DiscountType | None
    discount_value: float | None
    deposit_amount: float | None
    notes: str | None
    due_date: date | None
    shared_at: datetime | None
    share_token: str | None
    source_document_id: UUID | None
    line_items: list[LineItemResponse]
    created_at: datetime
    updated_at: datetime


class InvoiceListItemResponse(BaseModel):
    """Serializable invoice summary payload returned by the invoice list endpoint."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    customer_id: UUID
    customer_name: str
    doc_number: str
    title: str | None
    status: Literal["draft", "ready", "sent"]
    total_amount: float | None
    due_date: date | None
    created_at: datetime
    source_document_id: UUID | None


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
    """Request payload for partial invoice updates with full line-item replacement."""

    title: str | None = Field(default=None, max_length=120)
    line_items: list[LineItemDraft] | None = None
    total_amount: float | None = None
    tax_rate: float | None = None
    discount_type: DiscountType | None = None
    discount_value: float | None = None
    deposit_amount: float | None = None
    notes: str | None = None
    due_date: date | None = None

    _normalize_title = field_validator("title", mode="before")(_normalize_optional_title)

    @model_validator(mode="after")
    def validate_patch_fields(self) -> InvoiceUpdateRequest:
        """Reject explicit null for fields that only support omission semantics."""
        if "line_items" in self.model_fields_set and self.line_items is None:
            raise ValueError("line_items cannot be null")
        if "due_date" in self.model_fields_set and self.due_date is None:
            raise ValueError("due_date cannot be null")
        return self
