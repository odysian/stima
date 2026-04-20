"""Line-item catalog persistence model."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class LineItemCatalogItem(Base):
    """Reusable line-item preset owned by one authenticated user."""

    __tablename__ = "line_item_catalog_items"
    __table_args__ = (
        sa.CheckConstraint("btrim(title) <> ''", name="ck_line_item_catalog_items_title_non_blank"),
        sa.CheckConstraint(
            "default_price IS NULL OR default_price >= 0",
            name="ck_line_item_catalog_items_default_price_non_negative",
        ),
    )

    id: Mapped[UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        sa.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    details: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    default_price: Mapped[Decimal | None] = mapped_column(sa.Numeric(10, 2), nullable=True)
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
