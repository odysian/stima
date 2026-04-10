"""Add last_model_id to job_records.

Revision ID: 20260410_0020
Revises: 20260410_0019
Create Date: 2026-04-10
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260410_0020"
down_revision: str | None = "20260410_0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("job_records", sa.Column("last_model_id", sa.String(length=128), nullable=True))


def downgrade() -> None:
    op.drop_column("job_records", "last_model_id")
