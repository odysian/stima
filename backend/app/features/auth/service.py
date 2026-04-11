"""Auth service orchestration for registration, sessions, and token lifecycle."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from secrets import token_urlsafe
from typing import Protocol
from uuid import UUID, uuid4

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy.exc import IntegrityError

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.features.auth.models import PasswordResetToken, User
from app.features.auth.repository import RefreshRotationOutcome, RefreshRotationResult
from app.integrations.email import EmailConfigurationError, EmailMessage, EmailSendError

ACCESS_COOKIE_NAME = "stima_access_token"
REFRESH_COOKIE_NAME = "stima_refresh_token"
CSRF_COOKIE_NAME = "stima_csrf_token"
PASSWORD_RESET_TTL = timedelta(hours=1)
LOGGER = logging.getLogger(__name__)


class AuthServiceError(Exception):
    """Base auth exception mapped to an HTTP status code."""

    def __init__(self, *, detail: str, status_code: int) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class InvalidCredentialsError(AuthServiceError):
    """Raised when credentials/session tokens are invalid."""

    def __init__(self, detail: str = "Invalid credentials") -> None:
        super().__init__(detail=detail, status_code=401)


class ConflictError(AuthServiceError):
    """Raised when attempting to create a duplicate resource."""

    def __init__(self, detail: str) -> None:
        super().__init__(detail=detail, status_code=409)


class InvalidResetTokenError(AuthServiceError):
    """Raised when password reset token validation fails."""

    def __init__(self, detail: str = "Invalid or expired token") -> None:
        super().__init__(detail=detail, status_code=400)


@dataclass(slots=True)
class AuthSession:
    """Session payload returned by login/refresh service operations."""

    user: User
    access_token: str
    refresh_token: str
    csrf_token: str


class EmailServiceProtocol(Protocol):
    """Structural protocol for transactional email delivery."""

    async def send(self, message: EmailMessage) -> None: ...


class AuthRepositoryProtocol(Protocol):
    """Structural protocol for auth repository dependencies."""

    async def get_user_by_email(self, email: str) -> User | None: ...

    async def get_user_by_id(self, user_id: UUID) -> User | None: ...

    async def create_user(self, *, email: str, password_hash: str) -> User: ...

    async def create_refresh_token(
        self,
        *,
        user_id: UUID,
        token_hash: str,
        expires_at: datetime,
    ) -> object: ...

    async def create_reset_token(
        self,
        *,
        user_id: UUID,
        token_hash: str,
        expires_at: datetime,
    ) -> object: ...

    async def get_valid_reset_token(
        self,
        *,
        token_hash: str,
        now: datetime,
    ) -> PasswordResetToken | None: ...

    async def mark_reset_token_used(self, *, token_id: UUID, used_at: datetime) -> None: ...

    async def consume_and_rotate_refresh_token(
        self,
        *,
        consumed_token_hash: str,
        replacement_token_hash: str,
        replacement_expires_at: datetime,
        user_id: UUID,
        now: datetime,
    ) -> RefreshRotationResult: ...

    async def revoke_refresh_token(self, *, token_hash: str, revoked_at: datetime) -> None: ...

    async def revoke_all_user_tokens(self, *, user_id: UUID, revoked_at: datetime) -> None: ...

    async def commit(self) -> None: ...


class AuthService:
    """Coordinate auth domain rules with persistence and token helpers."""

    def __init__(
        self,
        repository: AuthRepositoryProtocol,
        *,
        email_service: EmailServiceProtocol | None = None,
        frontend_url: str | None = None,
        template_dir: Path | None = None,
    ) -> None:
        self._repository = repository
        self._email_service = email_service
        base_frontend_url = (frontend_url or "").strip().rstrip("/")
        self._frontend_url = base_frontend_url
        resolved_template_dir = template_dir or (Path(__file__).resolve().parents[2] / "templates")
        self._template_environment = Environment(
            loader=FileSystemLoader(str(resolved_template_dir)),
            autoescape=select_autoescape(["html", "xml"]),
            trim_blocks=True,
            lstrip_blocks=True,
        )

    async def register(self, *, email: str, password: str) -> User:
        """Register a new user with email/password credentials."""
        existing_user = await self._repository.get_user_by_email(email)
        if existing_user is not None:
            raise ConflictError(detail="Email is already registered")

        try:
            user = await self._repository.create_user(
                email=email,
                password_hash=hash_password(password),
            )
            await self._repository.commit()
        except IntegrityError as exc:
            raise ConflictError(detail="Email is already registered") from exc
        return user

    async def login(self, *, email: str, password: str) -> AuthSession:
        """Authenticate a user and mint a new cookie-auth session."""
        user = await self._repository.get_user_by_email(email)
        if user is None or not verify_password(password, user.password_hash):
            raise InvalidCredentialsError()
        if not user.is_active:
            raise InvalidCredentialsError()

        access_token = create_access_token(subject=str(user.id))
        refresh_token = self._create_refresh_token(subject=str(user.id))
        refresh_expires_at = _exp_to_datetime(decode_token(refresh_token)["exp"])

        await self._repository.create_refresh_token(
            user_id=user.id,
            token_hash=hash_token(refresh_token),
            expires_at=refresh_expires_at,
        )
        await self._repository.commit()

        return AuthSession(
            user=user,
            access_token=access_token,
            refresh_token=refresh_token,
            csrf_token=token_urlsafe(32),
        )

    async def refresh(self, *, refresh_token: str | None) -> AuthSession:
        """Rotate refresh token and issue fresh access/refresh credentials."""
        if not refresh_token:
            raise InvalidCredentialsError("Missing refresh token")

        payload = _decode_token_of_type(refresh_token, expected_kind="refresh")
        user_id = _parse_user_id(payload)

        replacement_refresh_token = self._create_refresh_token(subject=str(user_id))
        replacement_expires_at = _exp_to_datetime(decode_token(replacement_refresh_token)["exp"])

        rotation_result = await self._repository.consume_and_rotate_refresh_token(
            consumed_token_hash=hash_token(refresh_token),
            replacement_token_hash=hash_token(replacement_refresh_token),
            replacement_expires_at=replacement_expires_at,
            user_id=user_id,
            now=_utcnow(),
        )
        await self._repository.commit()

        if rotation_result.outcome != RefreshRotationOutcome.ROTATED:
            raise InvalidCredentialsError("Invalid or expired refresh token")
        if rotation_result.user is None:
            raise InvalidCredentialsError("Invalid or expired refresh token")

        return AuthSession(
            user=rotation_result.user,
            access_token=create_access_token(subject=str(rotation_result.user.id)),
            refresh_token=replacement_refresh_token,
            csrf_token=token_urlsafe(32),
        )

    async def logout(self, *, refresh_token: str | None) -> None:
        """Soft-revoke the current refresh token when present."""
        if not refresh_token:
            return

        try:
            _decode_token_of_type(refresh_token, expected_kind="refresh")
        except InvalidCredentialsError:
            return

        await self._repository.revoke_refresh_token(
            token_hash=hash_token(refresh_token),
            revoked_at=_utcnow(),
        )
        await self._repository.commit()

    async def get_authenticated_user(self, *, access_token: str | None) -> User:
        """Resolve the current user from an access cookie token."""
        if not access_token:
            raise InvalidCredentialsError("Authentication required")

        payload = _decode_token_of_type(access_token, expected_kind="access")
        user_id = _parse_user_id(payload)

        user = await self._repository.get_user_by_id(user_id)
        if user is None or not user.is_active:
            raise InvalidCredentialsError("Authentication required")
        return user

    async def request_password_reset(self, *, email: str) -> None:
        """Issue a one-time reset token for known emails and send reset instructions."""
        normalized_email = email.strip().lower()
        if not normalized_email:
            return

        user = await self._repository.get_user_by_email(normalized_email)
        if user is None:
            return

        raw_token = token_urlsafe(32)
        expires_at = _utcnow() + PASSWORD_RESET_TTL
        await self._repository.create_reset_token(
            user_id=user.id,
            token_hash=hash_token(raw_token),
            expires_at=expires_at,
        )
        await self._repository.commit()

        if self._email_service is None:
            return

        reset_link = self._build_reset_link(raw_token)
        try:
            await self._email_service.send(
                EmailMessage(
                    to_email=user.email,
                    subject="Reset your Stima password",
                    html_content=self._render_reset_password_html(reset_link=reset_link),
                    text_content=_render_reset_password_text(reset_link=reset_link),
                )
            )
        except (EmailConfigurationError, EmailSendError):
            LOGGER.warning(
                "password reset email delivery failed",
                exc_info=True,
                extra={"user_id": str(user.id)},
            )

    async def reset_password(self, *, token: str, new_password: str) -> None:
        """Consume a valid reset token, update password, and revoke refresh tokens."""
        now = _utcnow()
        reset_token = await self._repository.get_valid_reset_token(
            token_hash=hash_token(token),
            now=now,
        )
        if reset_token is None:
            raise InvalidResetTokenError()
        if not reset_token.user.is_active:
            raise InvalidResetTokenError()

        reset_token.user.password_hash = hash_password(new_password)
        await self._repository.mark_reset_token_used(token_id=reset_token.id, used_at=now)
        await self._repository.revoke_all_user_tokens(user_id=reset_token.user_id, revoked_at=now)
        await self._repository.commit()

    def _create_refresh_token(self, *, subject: str) -> str:
        return create_refresh_token(
            subject=subject,
            extra_claims={"jti": str(uuid4())},
        )

    def _build_reset_link(self, raw_token: str) -> str:
        return f"{self._frontend_url}/reset-password?token={raw_token}"

    def _render_reset_password_html(self, *, reset_link: str) -> str:
        template = self._template_environment.get_template("password_reset_email.html")
        return template.render(reset_link=reset_link)


def _decode_token_of_type(raw_token: str, *, expected_kind: str) -> dict[str, object]:
    try:
        payload = decode_token(raw_token)
    except ValueError as exc:
        raise InvalidCredentialsError("Invalid token") from exc
    if payload.get("type") != expected_kind:
        raise InvalidCredentialsError("Invalid token type")
    return payload


def _parse_user_id(payload: dict[str, object]) -> UUID:
    subject = payload.get("sub")
    if not isinstance(subject, str):
        raise InvalidCredentialsError("Invalid token payload")
    try:
        return UUID(subject)
    except ValueError as exc:
        raise InvalidCredentialsError("Invalid token payload") from exc


def _exp_to_datetime(exp: object) -> datetime:
    if isinstance(exp, datetime):
        if exp.tzinfo is None:
            return exp.replace(tzinfo=UTC)
        return exp.astimezone(UTC)
    if isinstance(exp, int | float):
        return datetime.fromtimestamp(exp, tz=UTC)
    raise InvalidCredentialsError("Invalid token expiry")


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _render_reset_password_text(*, reset_link: str) -> str:
    return (
        "We received a request to reset your Stima password.\n\n"
        f"Reset your password: {reset_link}\n\n"
        "This link expires in 1 hour. If you did not request this, you can ignore this email."
    )
