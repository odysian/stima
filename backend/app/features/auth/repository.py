"""Auth repository operations for users and refresh token lifecycle."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.features.auth.models import RefreshToken, User


class RefreshRotationOutcome(str, Enum):
    """Classify refresh rotation attempts for service-level handling."""

    ROTATED = "rotated"
    NOT_FOUND = "not_found"
    REPLAY_DETECTED = "replay_detected"
    EXPIRED = "expired"
    USER_MISMATCH = "user_mismatch"
    INACTIVE_USER = "inactive_user"


class RefreshRotationResult:
    """Container for refresh rotation results."""

    def __init__(self, *, outcome: RefreshRotationOutcome, user: User | None = None) -> None:
        self.outcome = outcome
        self.user = user


class AuthRepository:
    """Persist and query auth models using SQLAlchemy async sessions."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_user_by_email(self, email: str) -> User | None:
        """Fetch a user by canonicalized email."""
        stmt = select(User).where(User.email == email.lower())
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_user_by_id(self, user_id: UUID) -> User | None:
        """Fetch a user by primary key."""
        stmt = select(User).where(User.id == user_id)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_user(self, *, email: str, password_hash: str) -> User:
        """Create a new auth user."""
        user = User(
            email=email.lower(),
            password_hash=password_hash,
        )
        self._session.add(user)
        await self._session.flush()
        return user

    async def create_refresh_token(
        self,
        *,
        user_id: UUID,
        token_hash: str,
        expires_at: datetime,
    ) -> RefreshToken:
        """Store a new refresh token row."""
        refresh_token = RefreshToken(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        self._session.add(refresh_token)
        await self._session.flush()
        return refresh_token

    async def consume_and_rotate_refresh_token(
        self,
        *,
        consumed_token_hash: str,
        replacement_token_hash: str,
        replacement_expires_at: datetime,
        user_id: UUID,
        now: datetime,
    ) -> RefreshRotationResult:
        """Soft-revoke a consumed refresh token and issue a replacement atomically."""
        stmt = (
            select(RefreshToken)
            .options(selectinload(RefreshToken.user))
            .where(RefreshToken.token_hash == consumed_token_hash)
            .with_for_update()
        )
        result = await self._session.execute(stmt)
        current_token = result.scalar_one_or_none()
        if current_token is None:
            return RefreshRotationResult(outcome=RefreshRotationOutcome.NOT_FOUND)
        if current_token.revoked_at is not None:
            await self.revoke_all_user_tokens(user_id=current_token.user_id, revoked_at=now)
            return RefreshRotationResult(outcome=RefreshRotationOutcome.REPLAY_DETECTED)
        if current_token.expires_at <= now:
            return RefreshRotationResult(outcome=RefreshRotationOutcome.EXPIRED)
        if current_token.user_id != user_id:
            return RefreshRotationResult(outcome=RefreshRotationOutcome.USER_MISMATCH)
        if not current_token.user.is_active:
            return RefreshRotationResult(outcome=RefreshRotationOutcome.INACTIVE_USER)

        current_token.revoked_at = now
        replacement_token = RefreshToken(
            user_id=current_token.user_id,
            token_hash=replacement_token_hash,
            expires_at=replacement_expires_at,
        )
        self._session.add(replacement_token)
        await self._session.flush()

        return RefreshRotationResult(
            outcome=RefreshRotationOutcome.ROTATED,
            user=current_token.user,
        )

    async def revoke_refresh_token(self, *, token_hash: str, revoked_at: datetime) -> None:
        """Soft-revoke a refresh token when present and active."""
        stmt = (
            select(RefreshToken)
            .where(RefreshToken.token_hash == token_hash)
            .with_for_update()
        )
        result = await self._session.execute(stmt)
        refresh_token = result.scalar_one_or_none()
        if refresh_token is None:
            return
        if refresh_token.revoked_at is not None:
            return
        refresh_token.revoked_at = revoked_at
        await self._session.flush()

    async def revoke_all_user_tokens(self, *, user_id: UUID, revoked_at: datetime) -> None:
        """Revoke every active refresh token for a user."""
        stmt = (
            update(RefreshToken)
            .where(
                RefreshToken.user_id == user_id,
                RefreshToken.revoked_at.is_(None),
            )
            .values(revoked_at=revoked_at)
        )
        await self._session.execute(stmt)
        await self._session.flush()

    async def commit(self) -> None:
        """Commit pending repository writes."""
        await self._session.commit()
