"""Request/response schemas for profile read and update endpoints."""

from __future__ import annotations

import enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class TradeType(str, enum.Enum):
    """Allowed V0 trade types for onboarding profile completion."""

    LANDSCAPING = "Landscaping"
    POWER_WASHING = "Power Washing"


class ProfileResponse(BaseModel):
    """Serializable profile payload returned by profile endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    first_name: str | None
    last_name: str | None
    business_name: str | None
    trade_type: TradeType | None
    is_active: bool
    is_onboarded: bool


class ProfileUpdateRequest(BaseModel):
    """Request payload for onboarding/profile update writes."""

    business_name: str = Field(min_length=1, max_length=255)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    trade_type: TradeType
