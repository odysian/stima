"""Request/response schemas for profile read and update endpoints."""

from __future__ import annotations

import enum
from uuid import UUID
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


def _normalize_optional_text(value: object) -> object:
    if value is None or not isinstance(value, str):
        return value
    normalized = value.strip()
    return normalized or None


class TradeType(enum.StrEnum):
    """Allowed trade types for onboarding profile completion."""

    PLUMBER = "Plumber"
    ELECTRICIAN = "Electrician"
    BUILDER = "Builder"
    PAINTER = "Painter"
    LANDSCAPER = "Landscaper"
    OTHER = "Other"


class ProfileResponse(BaseModel):
    """Serializable profile payload returned by profile endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    first_name: str | None
    last_name: str | None
    phone_number: str | None
    business_name: str | None
    business_address_line1: str | None
    business_address_line2: str | None
    business_city: str | None
    business_state: str | None
    business_postal_code: str | None
    formatted_address: str | None
    trade_type: TradeType | None
    timezone: str | None
    default_tax_rate: float | None
    has_logo: bool
    is_active: bool
    is_onboarded: bool


class ProfileUpdateRequest(BaseModel):
    """Request payload for onboarding/profile update writes."""

    business_name: str = Field(min_length=1, max_length=255)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    trade_type: TradeType
    phone_number: str | None = Field(default=None, max_length=30)
    business_address_line1: str | None = Field(default=None, max_length=255)
    business_address_line2: str | None = Field(default=None, max_length=255)
    business_city: str | None = Field(default=None, max_length=100)
    business_state: str | None = Field(default=None, max_length=64)
    business_postal_code: str | None = Field(default=None, max_length=20)
    timezone: str | None = Field(default=None, max_length=64)
    default_tax_rate: float | None = None

    @field_validator(
        "phone_number",
        "business_address_line1",
        "business_address_line2",
        "business_city",
        "business_state",
        "business_postal_code",
        mode="before",
    )
    @classmethod
    def normalize_optional_text_fields(cls, value: object) -> object:
        return _normalize_optional_text(value)

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str | None) -> str | None:
        """Accept only valid IANA timezone identifiers when provided."""
        if value is None:
            return None

        normalized_value = value.strip()
        if not normalized_value:
            raise ValueError("Timezone must be a valid IANA timezone identifier")

        try:
            ZoneInfo(normalized_value)
        except Exception as exc:  # noqa: BLE001
            raise ValueError("Timezone must be a valid IANA timezone identifier") from exc

        return normalized_value

    @field_validator("default_tax_rate")
    @classmethod
    def validate_default_tax_rate(cls, value: float | None) -> float | None:
        """Accept only fractional tax rates between 0 and 1 when provided."""
        if value is None:
            return None
        if value < 0 or value > 1:
            raise ValueError("Default tax rate must be between 0 and 1")
        return value
