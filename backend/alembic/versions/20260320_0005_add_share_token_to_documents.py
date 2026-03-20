"""Add share token column to documents.

Revision ID: 20260320_0005
Revises: 20260320_0004
Create Date: 2026-03-20
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260320_0005"
down_revision: str | None = "20260320_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("share_token", sa.Text(), nullable=True))
    op.create_index(
        "ix_documents_share_token",
        "documents",
        ["share_token"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_documents_share_token", table_name="documents")
    op.drop_column("documents", "share_token")
