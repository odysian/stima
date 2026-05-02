"""Add archived_at visibility column to documents.

Revision ID: 20260502_0029
Revises: 20260429_0028
Create Date: 2026-05-02
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260502_0029"
down_revision: str | None = "20260429_0028"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_documents_archived_at", "documents", ["archived_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_documents_archived_at", table_name="documents")
    op.drop_column("documents", "archived_at")
