"""Add onboarding business fields to users.

Revision ID: 20260320_0002
Revises: 20260318_0001
Create Date: 2026-03-20
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20260320_0002"
down_revision: Union[str, None] = "20260318_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("business_name", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("trade_type", sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "trade_type")
    op.drop_column("users", "business_name")
