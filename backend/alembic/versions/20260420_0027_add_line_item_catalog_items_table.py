"""Add line-item catalog items table.

Revision ID: 20260420_0027
Revises: 20260418_0026
Create Date: 2026-04-20
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "20260420_0027"
down_revision: str | None = "20260418_0026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "line_item_catalog_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("default_price", sa.Numeric(precision=10, scale=2), nullable=True),
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
        sa.CheckConstraint("btrim(title) <> ''", name="ck_line_item_catalog_items_title_non_blank"),
        sa.CheckConstraint(
            "default_price IS NULL OR default_price >= 0",
            name="ck_line_item_catalog_items_default_price_non_negative",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_line_item_catalog_items_user_id"),
        "line_item_catalog_items",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_line_item_catalog_items_user_id"),
        table_name="line_item_catalog_items",
    )
    op.drop_table("line_item_catalog_items")
