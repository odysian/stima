"""Add title column to quote documents.

Revision ID: 20260326_0009
Revises: 20260325_0008
Create Date: 2026-03-26
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260326_0009"
down_revision: str | None = "20260325_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("title", sa.String(length=120), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("documents", "title")
