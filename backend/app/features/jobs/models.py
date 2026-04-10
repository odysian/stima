"""Job record persistence models."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class JobStatus(StrEnum):
    """Lifecycle states for durable background jobs."""

    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    TERMINAL = "terminal"


class JobType(StrEnum):
    """Supported background job categories."""

    EXTRACTION = "extraction"
    PDF = "pdf"
    EMAIL = "email"


class JobRecord(Base):
    """Durable job row mirrored across ARQ queue and application state."""

    __tablename__ = "job_records"

    id: Mapped[UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        sa.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_id: Mapped[UUID | None] = mapped_column(
        sa.ForeignKey("documents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    document_revision: Mapped[int | None] = mapped_column(sa.Integer, nullable=True)
    job_type: Mapped[JobType] = mapped_column(
        sa.Enum(
            JobType,
            values_callable=lambda enum_type: [member.value for member in enum_type],
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            name="job_type",
            length=20,
        ),
        nullable=False,
    )
    status: Mapped[JobStatus] = mapped_column(
        sa.Enum(
            JobStatus,
            values_callable=lambda enum_type: [member.value for member in enum_type],
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            name="job_status",
            length=20,
        ),
        nullable=False,
        server_default=JobStatus.PENDING.value,
    )
    attempts: Mapped[int] = mapped_column(
        sa.Integer,
        nullable=False,
        server_default=sa.text("0"),
    )
    last_model_id: Mapped[str | None] = mapped_column(sa.String(length=128), nullable=True)
    terminal_error: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    result_json: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
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
