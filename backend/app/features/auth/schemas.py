"""Request/response schemas for auth API endpoints."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    """Request body for auth registration."""

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    """Request body for auth login."""

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class AuthUserResponse(BaseModel):
    """Serializable auth user payload."""

    id: UUID
    email: EmailStr
    is_active: bool


class RegisterResponse(BaseModel):
    """Response body for successful registration."""

    user: AuthUserResponse


class AuthSessionResponse(BaseModel):
    """Session response for login and refresh endpoints."""

    user: AuthUserResponse
    csrf_token: str
