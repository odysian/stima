"""Auth API endpoints for cookie sessions, CSRF, and refresh rotation."""

from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status

from app.core.config import get_settings
from app.features.auth.models import User
from app.features.auth.schemas import (
    AuthSessionResponse,
    AuthUserResponse,
    LoginRequest,
    RegisterRequest,
    RegisterResponse,
)
from app.features.auth.service import (
    ACCESS_COOKIE_NAME,
    CSRF_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    AuthService,
    AuthServiceError,
)
from app.shared.dependencies import get_auth_service, get_current_user, require_csrf
from app.shared.observability import log_security_event
from app.shared.rate_limit import get_ip_key, limiter

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit(lambda: get_settings().auth_register_rate_limit, key_func=get_ip_key)
async def register(
    request: Request,
    payload: RegisterRequest,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> RegisterResponse:
    """Register a user with email/password only."""
    del request
    try:
        user = await auth_service.register(
            email=str(payload.email),
            password=payload.password,
        )
    except AuthServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return RegisterResponse(user=_serialize_user(user))


@router.post("/login", response_model=AuthSessionResponse)
@limiter.limit(lambda: get_settings().auth_login_rate_limit, key_func=get_ip_key)
async def login(
    request: Request,
    payload: LoginRequest,
    response: Response,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> AuthSessionResponse:
    """Authenticate and set access/refresh/csrf cookies."""
    del request
    try:
        session = await auth_service.login(
            email=str(payload.email),
            password=payload.password,
        )
    except AuthServiceError as exc:
        if exc.status_code == status.HTTP_401_UNAUTHORIZED:
            log_security_event(
                "auth.login_failed",
                outcome="denied",
                level=logging.WARNING,
                status_code=exc.status_code,
                reason="invalid_credentials",
            )
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    _set_auth_cookies(
        response=response,
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        csrf_token=session.csrf_token,
    )
    return AuthSessionResponse(
        user=_serialize_user(session.user),
        csrf_token=session.csrf_token,
    )


@router.post(
    "/refresh",
    response_model=AuthSessionResponse,
    dependencies=[Depends(require_csrf)],
)
@limiter.limit(lambda: get_settings().auth_refresh_rate_limit, key_func=get_ip_key)
async def refresh(
    request: Request,
    response: Response,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE_NAME)] = None,
) -> AuthSessionResponse:
    """Rotate refresh token and issue a fresh session."""
    del request
    try:
        session = await auth_service.refresh(refresh_token=refresh_token)
    except AuthServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    _set_auth_cookies(
        response=response,
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        csrf_token=session.csrf_token,
    )
    return AuthSessionResponse(
        user=_serialize_user(session.user),
        csrf_token=session.csrf_token,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(lambda: get_settings().auth_logout_rate_limit, key_func=get_ip_key)
async def logout(
    request: Request,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    _csrf_checked: Annotated[None, Depends(require_csrf)],
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE_NAME)] = None,
) -> Response:
    """Revoke refresh token and clear auth cookies."""
    del request
    await auth_service.logout(refresh_token=refresh_token)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_auth_cookies(response)
    return response


@router.get("/me", response_model=AuthUserResponse)
async def get_me(
    user: Annotated[User, Depends(get_current_user)],
) -> AuthUserResponse:
    """Return the authenticated user represented by the access cookie."""
    return _serialize_user(user)


def _serialize_user(user: User) -> AuthUserResponse:
    return AuthUserResponse(
        id=user.id,
        email=user.email,
        is_active=user.is_active,
        is_onboarded=user.is_onboarded,
        timezone=user.timezone,
    )


def _set_auth_cookies(
    *,
    response: Response,
    access_token: str,
    refresh_token: str,
    csrf_token: str,
) -> None:
    settings = get_settings()
    shared_cookie_kwargs = _shared_cookie_kwargs()

    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value=access_token,
        httponly=settings.cookie_httponly,
        max_age=settings.access_token_expire_minutes * 60,
        path="/api/",
        **shared_cookie_kwargs,
    )
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=settings.cookie_httponly,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        path="/api/auth/",
        **shared_cookie_kwargs,
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=csrf_token,
        httponly=False,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        path="/",
        **shared_cookie_kwargs,
    )


def _clear_auth_cookies(response: Response) -> None:
    settings = get_settings()
    for path in ("/api/", "/"):
        response.delete_cookie(
            key=ACCESS_COOKIE_NAME,
            path=path,
            domain=settings.cookie_domain,
        )
    for path in ("/api/auth/", "/"):
        response.delete_cookie(
            key=REFRESH_COOKIE_NAME,
            path=path,
            domain=settings.cookie_domain,
        )
    for path in ("/", "/api/"):
        response.delete_cookie(
            key=CSRF_COOKIE_NAME,
            path=path,
            domain=settings.cookie_domain,
        )


def _shared_cookie_kwargs() -> dict[str, Any]:
    settings = get_settings()
    return {
        "secure": settings.cookie_secure,
        "samesite": settings.cookie_samesite,
        "domain": settings.cookie_domain,
    }
