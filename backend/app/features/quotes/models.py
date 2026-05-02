"""Quote persistence models."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class DocumentStatus(StrEnum):
    """Lifecycle states used across quote and invoice documents."""

    DRAFT = "draft"
    READY = "ready"
    SHARED = "shared"
    VIEWED = "viewed"
    APPROVED = "approved"
    DECLINED = "declined"
    SENT = "sent"
    PAID = "paid"
    VOID = "void"


QuoteStatus = DocumentStatus


class Document(Base):
    """Quote document persisted for an authenticated user."""

    __tablename__ = "documents"
    __table_args__ = (
        sa.UniqueConstraint(
            "user_id",
            "doc_type",
            "doc_sequence",
            name="uq_documents_user_type_sequence",
        ),
        sa.CheckConstraint(
            "doc_type <> 'invoice' OR customer_id IS NOT NULL",
            name="ck_documents_invoice_customer_required",
        ),
    )

    id: Mapped[UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        sa.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    customer_id: Mapped[UUID | None] = mapped_column(
        sa.ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    doc_type: Mapped[str] = mapped_column(
        sa.String(20),
        nullable=False,
        server_default="quote",
    )
    doc_sequence: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    doc_number: Mapped[str] = mapped_column(sa.String(20), nullable=False)
    title: Mapped[str | None] = mapped_column(sa.String(120), nullable=True)
    source_document_id: Mapped[UUID | None] = mapped_column(
        sa.ForeignKey("documents.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[DocumentStatus] = mapped_column(
        sa.Enum(
            DocumentStatus,
            values_callable=lambda enum_type: [member.value for member in enum_type],
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            name="quote_status",
            length=20,
        ),
        nullable=False,
        server_default=DocumentStatus.DRAFT.value,
    )
    source_type: Mapped[str] = mapped_column(sa.String(20), nullable=False)
    transcript: Mapped[str] = mapped_column(sa.Text, nullable=False)
    extraction_tier: Mapped[str | None] = mapped_column(sa.String(20), nullable=True)
    extraction_degraded_reason_code: Mapped[str | None] = mapped_column(
        sa.String(64),
        nullable=True,
    )
    extraction_review_metadata: Mapped[dict[str, object] | None] = mapped_column(
        JSONB,
        nullable=True,
    )
    total_amount: Mapped[Decimal | None] = mapped_column(sa.Numeric(10, 2), nullable=True)
    tax_rate: Mapped[Decimal | None] = mapped_column(sa.Numeric(5, 4), nullable=True)
    discount_type: Mapped[str | None] = mapped_column(sa.String(7), nullable=True)
    discount_value: Mapped[Decimal | None] = mapped_column(sa.Numeric(10, 2), nullable=True)
    deposit_amount: Mapped[Decimal | None] = mapped_column(sa.Numeric(10, 2), nullable=True)
    notes: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    due_date: Mapped[date | None] = mapped_column(sa.Date, nullable=True)
    pdf_url: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    pdf_artifact_path: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    pdf_artifact_revision: Mapped[int] = mapped_column(
        sa.Integer,
        nullable=False,
        server_default=sa.text("0"),
    )
    pdf_artifact_job_id: Mapped[UUID | None] = mapped_column(
        sa.Uuid,
        nullable=True,
        index=True,
    )
    share_token: Mapped[str | None] = mapped_column(sa.Text, nullable=True, unique=True)
    shared_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=True,
    )
    share_token_created_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=True,
    )
    share_token_expires_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=True,
    )
    share_token_revoked_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=True,
    )
    last_public_accessed_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=True,
    )
    invoice_first_viewed_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=True,
    )
    archived_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=True,
        index=True,
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
    flagged: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        server_default=sa.text("false"),
    )
    flag_reason: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
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
