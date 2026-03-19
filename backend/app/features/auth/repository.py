"""Auth repository operations for users and refresh token lifecycle."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.features.auth.models import RefreshToken, User


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
    ) -> User | None:
        """Soft-revoke a consumed refresh token and issue a replacement atomically."""
        async with self._session.begin():
            stmt = (
                select(RefreshToken)
                .options(selectinload(RefreshToken.user))
                .where(RefreshToken.token_hash == consumed_token_hash)
                .with_for_update()
            )
            result = await self._session.execute(stmt)
            current_token = result.scalar_one_or_none()
            if current_token is None:
                return None
            if current_token.revoked_at is not None:
                return None
            if current_token.expires_at <= now:
                return None
            if current_token.user_id != user_id:
                return None
            if not current_token.user.is_active:
                return None

            current_token.revoked_at = now
            replacement_token = RefreshToken(
                user_id=current_token.user_id,
                token_hash=replacement_token_hash,
                expires_at=replacement_expires_at,
            )
            self._session.add(replacement_token)
            await self._session.flush()

            return current_token.user

    async def revoke_refresh_token(self, *, token_hash: str, revoked_at: datetime) -> None:
        """Soft-revoke a refresh token when present and active."""
        async with self._session.begin():
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

    async def commit(self) -> None:
        """Commit pending repository writes."""
        await self._session.commit()
