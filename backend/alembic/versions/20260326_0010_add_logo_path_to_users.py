"""Add logo path column to users.

Revision ID: 20260326_0010
Revises: 20260326_0009
Create Date: 2026-03-26
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260326_0010"
down_revision: str | None = "20260326_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("logo_path", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "logo_path")
