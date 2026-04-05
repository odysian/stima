"""Add durable job_records table for worker-backed side effects.

Revision ID: 20260405_0015
Revises: 20260405_0014
Create Date: 2026-04-05
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260405_0015"
down_revision: str | None = "20260405_0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

job_type_enum = sa.Enum(
    "extraction",
    "pdf",
    "email",
    name="job_type",
    native_enum=False,
    create_constraint=True,
    length=20,
)
job_status_enum = sa.Enum(
    "pending",
    "running",
    "success",
    "failed",
    "terminal",
    name="job_status",
    native_enum=False,
    create_constraint=True,
    length=20,
)


def upgrade() -> None:
    op.create_table(
        "job_records",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=True),
        sa.Column("job_type", job_type_enum, nullable=False),
        sa.Column(
            "status",
            job_status_enum,
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column(
            "attempts",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("terminal_error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_job_records_user_id", "job_records", ["user_id"])
    op.create_index("ix_job_records_document_id", "job_records", ["document_id"])


def downgrade() -> None:
    op.drop_index("ix_job_records_document_id", table_name="job_records")
    op.drop_index("ix_job_records_user_id", table_name="job_records")
    op.drop_table("job_records")
