"""Add structured business and customer address columns.

Revision ID: 20260429_0028
Revises: 20260420_0027
Create Date: 2026-04-29
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260429_0028"
down_revision: str | None = "20260420_0027"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("business_address_line1", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("business_address_line2", sa.String(length=255), nullable=True),
    )
    op.add_column("users", sa.Column("business_city", sa.String(length=100), nullable=True))
    op.add_column("users", sa.Column("business_state", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("business_postal_code", sa.String(length=20), nullable=True))

    op.add_column("customers", sa.Column("address_line1", sa.String(length=255), nullable=True))
    op.add_column("customers", sa.Column("address_line2", sa.String(length=255), nullable=True))
    op.add_column("customers", sa.Column("city", sa.String(length=100), nullable=True))
    op.add_column("customers", sa.Column("state", sa.String(length=64), nullable=True))
    op.add_column("customers", sa.Column("postal_code", sa.String(length=20), nullable=True))

    op.execute(
        sa.text(
            """
            UPDATE customers
            SET address_line1 = NULLIF(BTRIM(address), '')
            WHERE address_line1 IS NULL
              AND address IS NOT NULL
              AND NULLIF(BTRIM(address), '') IS NOT NULL
            """
        )
    )


def downgrade() -> None:
    op.drop_column("customers", "postal_code")
    op.drop_column("customers", "state")
    op.drop_column("customers", "city")
    op.drop_column("customers", "address_line2")
    op.drop_column("customers", "address_line1")

    op.drop_column("users", "business_postal_code")
    op.drop_column("users", "business_state")
    op.drop_column("users", "business_city")
    op.drop_column("users", "business_address_line2")
    op.drop_column("users", "business_address_line1")
