"""Request schemas for support contact endpoints."""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field, field_validator

from app.shared.input_limits import SUPPORT_CONTACT_MESSAGE_MAX_CHARS


class SupportContactCategory(StrEnum):
    """Allowlisted support contact categories."""

    BUG = "bug"
    QUOTE_QUALITY = "quote_quality"
    CONFUSING_WORKFLOW = "confusing_workflow"
    SECURITY_PRIVACY = "security_privacy"
    OTHER = "other"


class SupportContactRequest(BaseModel):
    """Validated support contact payload for authenticated users."""

    category: SupportContactCategory
    message: str = Field(min_length=1, max_length=SUPPORT_CONTACT_MESSAGE_MAX_CHARS)

    @field_validator("message", mode="before")
    @classmethod
    def normalize_message(cls, value: object) -> str:
        if not isinstance(value, str):
            raise ValueError("message must be a string")
        trimmed_message = value.strip()
        if not trimmed_message:
            raise ValueError("message cannot be blank")
        if len(trimmed_message) > SUPPORT_CONTACT_MESSAGE_MAX_CHARS:
            raise ValueError(
                f"message must be at most {SUPPORT_CONTACT_MESSAGE_MAX_CHARS} characters"
            )
        return trimmed_message
