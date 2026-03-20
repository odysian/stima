"""Quote persistence models."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class QuoteStatus(StrEnum):
    """Lifecycle states for quote documents."""

    DRAFT = "draft"
    READY = "ready"
    SHARED = "shared"


class Document(Base):
    """Quote document persisted for an authenticated user."""

    __tablename__ = "documents"
    __table_args__ = (sa.UniqueConstraint("user_id", "doc_sequence", name="uq_documents_user_sequence"),)

    id: Mapped[UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        sa.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    customer_id: Mapped[UUID] = mapped_column(
        sa.ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    doc_type: Mapped[str] = mapped_column(
        sa.String(20),
        nullable=False,
        server_default="quote",
    )
    doc_sequence: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    doc_number: Mapped[str] = mapped_column(sa.String(20), nullable=False)
    status: Mapped[QuoteStatus] = mapped_column(
        sa.Enum(
            QuoteStatus,
            values_callable=lambda enum_type: [member.value for member in enum_type],
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            name="quote_status",
            length=20,
        ),
        nullable=False,
        server_default=QuoteStatus.DRAFT.value,
    )
    source_type: Mapped[str] = mapped_column(sa.String(20), nullable=False)
    transcript: Mapped[str] = mapped_column(sa.Text, nullable=False)
    total_amount: Mapped[Decimal | None] = mapped_column(sa.Numeric(10, 2), nullable=True)
    notes: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    pdf_url: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    shared_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=True,
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

    line_items: Mapped[list[LineItem]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="LineItem.sort_order",
    )


class LineItem(Base):
    """Editable line item associated with a quote document."""

    __tablename__ = "line_items"

    id: Mapped[UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid4)
    document_id: Mapped[UUID] = mapped_column(
        sa.ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    description: Mapped[str] = mapped_column(sa.Text, nullable=False)
    details: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    price: Mapped[Decimal | None] = mapped_column(sa.Numeric(10, 2), nullable=True)
    sort_order: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0)
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

    document: Mapped[Document] = relationship(back_populates="line_items")
