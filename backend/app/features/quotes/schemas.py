"""Request/response schemas for quote extraction and quote CRUD endpoints."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def _normalize_optional_title(value: object) -> object:
    """Trim optional title values and collapse blanks to null."""
    if value is None or not isinstance(value, str):
        return value
    trimmed = value.strip()
    return trimmed or None


class LineItemDraft(BaseModel):
    """Editable line item payload used for quote creation and updates."""

    description: str = Field(min_length=1)
    details: str | None = None
    price: float | None = None


class LineItemExtracted(LineItemDraft):
    """Extraction-only line item metadata used during review."""

    flagged: bool = False
    flag_reason: str | None = None


class ExtractionResult(BaseModel):
    """Structured extraction output returned from convert-notes."""

    transcript: str = Field(min_length=1)
    line_items: list[LineItemExtracted] = Field(default_factory=list)
    total: float | None = None
    confidence_notes: list[str] = Field(default_factory=list)


class ConvertNotesRequest(BaseModel):
    """Request payload for text-note extraction."""

    notes: str = Field(min_length=1)


class QuoteCreateRequest(BaseModel):
    """Request payload for creating a quote from a draft."""

    customer_id: UUID
    title: str | None = Field(default=None, max_length=120)
    transcript: str = Field(min_length=1)
    line_items: list[LineItemDraft] = Field(default_factory=list)
    total_amount: float | None = None
    notes: str | None = None
    source_type: Literal["text", "voice"]

    _normalize_title = field_validator("title", mode="before")(_normalize_optional_title)


class QuoteUpdateRequest(BaseModel):
    """Request payload for partial quote updates with full line-item replacement."""

    title: str | None = Field(default=None, max_length=120)
    line_items: list[LineItemDraft] | None = None
    total_amount: float | None = None
    notes: str | None = None

    _normalize_title = field_validator("title", mode="before")(_normalize_optional_title)

    @model_validator(mode="after")
    def validate_line_items_not_null_when_provided(self) -> QuoteUpdateRequest:
        """Reject explicit null for line_items while allowing omission."""
        if "line_items" in self.model_fields_set and self.line_items is None:
            raise ValueError("line_items cannot be null")
        return self


class LineItemResponse(BaseModel):
    """Serializable line item payload returned in quote responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    description: str
    details: str | None
    price: float | None
    sort_order: int


class PublicLineItemResponse(BaseModel):
    """Serializable public line-item payload used by quote landing pages."""

    model_config = ConfigDict(from_attributes=True)

    description: str
    details: str | None
    price: float | None


class QuoteListItemResponse(BaseModel):
    """Serializable quote summary payload returned by the quote list endpoint."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    customer_id: UUID
    customer_name: str
    doc_number: str
    title: str | None
    status: str
    total_amount: float | None
    item_count: int
    created_at: datetime


class QuoteResponse(BaseModel):
    """Serializable quote payload returned by quote endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    customer_id: UUID
    doc_number: str
    title: str | None
    status: str
    source_type: Literal["text", "voice"]
    transcript: str
    total_amount: float | None
    notes: str | None
    shared_at: datetime | None
    share_token: str | None
    line_items: list[LineItemResponse]
    created_at: datetime
    updated_at: datetime


class LinkedInvoiceResponse(BaseModel):
    """Compact linked invoice payload returned from quote detail."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    doc_number: str
    status: str
    due_date: date | None
    total_amount: float | None
    created_at: datetime


class QuoteDetailResponse(QuoteResponse):
    """Quote detail payload including customer display fields."""

    customer_name: str
    customer_email: str | None
    customer_phone: str | None
    linked_invoice: LinkedInvoiceResponse | None


class PublicQuoteResponse(BaseModel):
    """Serializable unauthenticated quote payload for the public landing page."""

    business_name: str | None
    customer_name: str
    doc_number: str
    title: str | None
    status: str
    total_amount: float | None
    notes: str | None
    issued_date: str
    logo_url: str
    download_url: str
    line_items: list[PublicLineItemResponse]
