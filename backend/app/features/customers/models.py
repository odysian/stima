"""Customer persistence model."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.shared.address_formatting import format_address


class Customer(Base):
    """Customer record scoped to an authenticated user."""

    __tablename__ = "customers"

    id: Mapped[UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        sa.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(sa.String(30), nullable=True)
    email: Mapped[str | None] = mapped_column(sa.String(320), nullable=True)
    address: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    address_line1: Mapped[str | None] = mapped_column(sa.String(255), nullable=True)
    address_line2: Mapped[str | None] = mapped_column(sa.String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(sa.String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(sa.String(64), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(sa.String(20), nullable=True)
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

    @property
    def formatted_address(self) -> str | None:
        """Return structured address when present, else normalized legacy address."""
        structured_address = format_address(
            self.address_line1,
            self.address_line2,
            self.city,
            self.state,
            self.postal_code,
        )
        if structured_address is not None:
            return structured_address
        if self.address is None:
            return None
        normalized_legacy_address = self.address.strip()
        return normalized_legacy_address or None
