"""Add line-item price status for extraction 2.5 semantics.

Revision ID: 20260416_0024
Revises: 20260415_0023
Create Date: 2026-04-16
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260416_0024"
down_revision: str | None = "20260415_0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("line_items", sa.Column("price_status", sa.Text(), nullable=True))
    op.create_check_constraint(
        "ck_line_items_price_status",
        "line_items",
        "price_status in ('priced', 'included', 'unknown') or price_status is null",
    )


def downgrade() -> None:
    op.drop_constraint("ck_line_items_price_status", "line_items", type_="check")
    op.drop_column("line_items", "price_status")
