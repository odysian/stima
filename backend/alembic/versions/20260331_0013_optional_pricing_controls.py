"""Add optional pricing controls to documents and user tax defaults.

Revision ID: 20260331_0013
Revises: 20260330_0012
Create Date: 2026-03-31
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260331_0013"
down_revision: str | None = "20260330_0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_DISCOUNT_TYPE_CONSTRAINT = "ck_documents_discount_type"


def upgrade() -> None:
    op.add_column("users", sa.Column("default_tax_rate", sa.Numeric(5, 4), nullable=True))

    op.add_column("documents", sa.Column("tax_rate", sa.Numeric(5, 4), nullable=True))
    op.add_column("documents", sa.Column("discount_type", sa.String(length=7), nullable=True))
    op.add_column("documents", sa.Column("discount_value", sa.Numeric(10, 2), nullable=True))
    op.add_column("documents", sa.Column("deposit_amount", sa.Numeric(10, 2), nullable=True))
    op.create_check_constraint(
        _DISCOUNT_TYPE_CONSTRAINT,
        "documents",
        "discount_type IN ('fixed', 'percent') OR discount_type IS NULL",
    )


def downgrade() -> None:
    op.drop_constraint(_DISCOUNT_TYPE_CONSTRAINT, "documents", type_="check")
    op.drop_column("documents", "deposit_amount")
    op.drop_column("documents", "discount_value")
    op.drop_column("documents", "discount_type")
    op.drop_column("documents", "tax_rate")
    op.drop_column("users", "default_tax_rate")
