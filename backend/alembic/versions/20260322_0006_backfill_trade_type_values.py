"""Backfill stale trade_type values after enum rename.

Revision ID: 20260322_0006
Revises: 20260320_0005
Create Date: 2026-03-22
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260322_0006"
down_revision: str | None = "20260320_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE users
            SET trade_type = 'Landscaper'
            WHERE trade_type = 'Landscaping'
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE users
            SET trade_type = 'Other'
            WHERE trade_type = 'Power Washing'
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE users
            SET trade_type = 'Landscaping'
            WHERE trade_type = 'Landscaper'
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE users
            SET trade_type = 'Power Washing'
            WHERE trade_type = 'Other'
            """
        )
    )
