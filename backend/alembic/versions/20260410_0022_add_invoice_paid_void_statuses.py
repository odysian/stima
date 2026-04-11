"""Add paid and void invoice statuses.

Revision ID: 20260410_0022
Revises: 20260410_0021
Create Date: 2026-04-10
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260410_0022"
down_revision: str | None = "20260410_0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_STATUS_CONSTRAINT = "quote_status"
_EXPANDED_STATUSES = (
    "draft",
    "ready",
    "shared",
    "viewed",
    "approved",
    "declined",
    "sent",
    "paid",
    "void",
)
_PREVIOUS_STATUSES = (
    "draft",
    "ready",
    "shared",
    "viewed",
    "approved",
    "declined",
    "sent",
)


def upgrade() -> None:
    op.drop_constraint(_STATUS_CONSTRAINT, "documents", type_="check")
    op.create_check_constraint(
        _STATUS_CONSTRAINT,
        "documents",
        _build_status_check(_EXPANDED_STATUSES),
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE documents
            SET status = 'sent'
            WHERE status IN ('paid', 'void')
            """
        )
    )
    op.drop_constraint(_STATUS_CONSTRAINT, "documents", type_="check")
    op.create_check_constraint(
        _STATUS_CONSTRAINT,
        "documents",
        _build_status_check(_PREVIOUS_STATUSES),
    )


def _build_status_check(statuses: Sequence[str]) -> str:
    quoted_statuses = ", ".join(f"'{status}'" for status in statuses)
    return f"status IN ({quoted_statuses})"
