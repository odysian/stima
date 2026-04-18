"""Remove line-item price_status and migrate included notes marker.

Revision ID: 20260418_0026
Revises: 20260418_0025
Create Date: 2026-04-18
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260418_0026"
down_revision: str | None = "20260418_0025"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    bind.execute(
        sa.text(
            """
            UPDATE line_items
            SET details = '(included)'
            WHERE price_status = 'included'
              AND price IS NULL
              AND (details IS NULL OR btrim(details) = '')
            """
        )
    )

    check_constraints = {
        constraint.get("name") for constraint in inspector.get_check_constraints("line_items")
    }
    if "ck_line_items_price_status" in check_constraints:
        op.drop_constraint("ck_line_items_price_status", "line_items", type_="check")

    line_item_columns = {column["name"] for column in inspector.get_columns("line_items")}
    if "price_status" in line_item_columns:
        op.drop_column("line_items", "price_status")


def downgrade() -> None:
    # Cleanup migration is intentionally not reversible.
    pass
