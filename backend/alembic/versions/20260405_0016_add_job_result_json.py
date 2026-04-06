"""Add serialized result storage to durable job records.

Revision ID: 20260405_0016
Revises: 20260405_0015
Create Date: 2026-04-05
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260405_0016"
down_revision: str | None = "20260405_0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("job_records", sa.Column("result_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("job_records", "result_json")
