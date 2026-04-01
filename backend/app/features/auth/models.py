"""Auth persistence models for users and refresh tokens."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class User(Base):
    """Authentication user model."""

    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(sa.String(320), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(sa.String(512), nullable=False)
    first_name: Mapped[str | None] = mapped_column(sa.String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(sa.String(100), nullable=True)
    phone_number: Mapped[str | None] = mapped_column(sa.String(30), nullable=True)
    business_name: Mapped[str | None] = mapped_column(sa.String(255), nullable=True)
    trade_type: Mapped[str | None] = mapped_column(sa.String(50), nullable=True)
    timezone: Mapped[str | None] = mapped_column(sa.String(64), nullable=True)
    default_tax_rate: Mapped[Decimal | None] = mapped_column(sa.Numeric(5, 4), nullable=True)
    logo_path: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        server_default=sa.text("true"),
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        onupdate=sa.func.now(),
    )

    refresh_tokens: Mapped[list[RefreshToken]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )

    @property
    def is_onboarded(self) -> bool:
        """Return true when all required onboarding profile fields are populated."""
        return bool(self.business_name and self.first_name and self.last_name and self.trade_type)

    @property
    def has_logo(self) -> bool:
        """Return true when the user currently has a stored logo path."""
        return bool(self.logo_path)


class RefreshToken(Base):
    """Refresh token model with soft revocation support."""

    __tablename__ = "refresh_tokens"

    id: Mapped[UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        sa.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(
        sa.String(64),
        nullable=False,
        unique=True,
        index=True,
    )
    expires_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=True,
    )

    user: Mapped[User] = relationship(back_populates="refresh_tokens")
