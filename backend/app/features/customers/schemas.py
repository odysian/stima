"""Request/response schemas for customer endpoints."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.shared.input_limits import CUSTOMER_ADDRESS_MAX_CHARS


def _normalize_optional_text(value: object) -> object:
    if value is None or not isinstance(value, str):
        return value
    normalized = value.strip()
    return normalized or None


class CustomerCreateRequest(BaseModel):
    """Request payload for customer creation."""

    name: str = Field(min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=320)
    address: str | None = Field(default=None, max_length=CUSTOMER_ADDRESS_MAX_CHARS)
    address_line1: str | None = Field(default=None, max_length=255)
    address_line2: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=64)
    postal_code: str | None = Field(default=None, max_length=20)

    @model_validator(mode="before")
    @classmethod
    def normalize_optional_fields(cls, values: object) -> object:
        if not isinstance(values, dict):
            return values
        for field_name in (
            "phone",
            "email",
            "address",
            "address_line1",
            "address_line2",
            "city",
            "state",
            "postal_code",
        ):
            if field_name in values:
                values[field_name] = _normalize_optional_text(values[field_name])
        return values


class CustomerUpdateRequest(BaseModel):
    """Request payload for partial customer updates."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=320)
    address: str | None = Field(default=None, max_length=CUSTOMER_ADDRESS_MAX_CHARS)
    address_line1: str | None = Field(default=None, max_length=255)
    address_line2: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=64)
    postal_code: str | None = Field(default=None, max_length=20)

    @model_validator(mode="after")
    def validate_name_is_not_null_when_provided(self) -> CustomerUpdateRequest:
        """Reject explicit null for name while still allowing omitted field."""
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be null")
        return self

    @model_validator(mode="before")
    @classmethod
    def normalize_optional_fields(cls, values: object) -> object:
        if not isinstance(values, dict):
            return values
        for field_name in (
            "phone",
            "email",
            "address",
            "address_line1",
            "address_line2",
            "city",
            "state",
            "postal_code",
        ):
            if field_name in values:
                values[field_name] = _normalize_optional_text(values[field_name])
        return values


class CustomerResponse(BaseModel):
    """Serializable customer payload returned by customer endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    phone: str | None
    email: str | None
    address: str | None
    address_line1: str | None
    address_line2: str | None
    city: str | None
    state: str | None
    postal_code: str | None
    formatted_address: str | None
    created_at: datetime
    updated_at: datetime
