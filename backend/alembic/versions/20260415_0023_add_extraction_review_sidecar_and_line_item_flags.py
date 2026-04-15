"""Add extraction review metadata sidecar and line-item flag columns.

Revision ID: 20260415_0023
Revises: 20260410_0022
Create Date: 2026-04-15
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "20260415_0023"
down_revision: str | None = "20260410_0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column(
            "extraction_review_metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )

    op.add_column(
        "line_items",
        sa.Column(
            "flagged",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column("line_items", sa.Column("flag_reason", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("line_items", "flag_reason")
    op.drop_column("line_items", "flagged")
    op.drop_column("documents", "extraction_review_metadata")
