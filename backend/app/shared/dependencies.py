"""Shared app dependencies for auth services and request guards."""

from __future__ import annotations

from hmac import compare_digest
from typing import Annotated

from fastapi import Cookie, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.features.auth.models import User
from app.features.auth.repository import AuthRepository
from app.features.auth.service import (
    ACCESS_COOKIE_NAME,
    CSRF_COOKIE_NAME,
    AuthService,
    AuthServiceError,
)
from app.features.customers.repository import CustomerRepository
from app.features.customers.service import CustomerService
from app.features.profile.repository import ProfileRepository
from app.features.profile.service import ProfileService


def get_auth_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AuthService:
    """Build a request-scoped auth service wired to the DB session."""
    return AuthService(repository=AuthRepository(db))


def get_profile_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProfileService:
    """Build a request-scoped profile service wired to the DB session."""
    return ProfileService(repository=ProfileRepository(db))


def get_customer_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CustomerService:
    """Build a request-scoped customer service wired to the DB session."""
    return CustomerService(repository=CustomerRepository(db))


async def get_current_user(
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    access_token: Annotated[str | None, Cookie(alias=ACCESS_COOKIE_NAME)] = None,
) -> User:
    """Resolve current user from the access cookie."""
    try:
        return await auth_service.get_authenticated_user(access_token=access_token)
    except AuthServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


def require_csrf(
    csrf_cookie: Annotated[str | None, Cookie(alias=CSRF_COOKIE_NAME)] = None,
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> None:
    """Enforce double-submit CSRF checks for mutating cookie-auth endpoints."""
    if csrf_cookie is None or csrf_header is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token missing",
        )
    if not compare_digest(csrf_cookie, csrf_header):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token mismatch",
        )
