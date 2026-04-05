"""Add public share lifecycle tracking columns to documents.

Revision ID: 20260405_0014
Revises: 20260331_0013
Create Date: 2026-04-05
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260405_0014"
down_revision: str | None = "20260331_0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_BACKFILL_SHARE_LINK_EXPIRY_DAYS = 90


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("share_token_created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column("share_token_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column("share_token_revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column("last_public_accessed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column("invoice_first_viewed_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.execute(
        sa.text(
            """
            UPDATE documents
            SET share_token_created_at = shared_at,
                share_token_expires_at = shared_at + (:expiry_days || ' days')::interval
            WHERE share_token IS NOT NULL
              AND shared_at IS NOT NULL
            """
        ).bindparams(expiry_days=str(_BACKFILL_SHARE_LINK_EXPIRY_DAYS))
    )


def downgrade() -> None:
    op.drop_column("documents", "invoice_first_viewed_at")
    op.drop_column("documents", "last_public_accessed_at")
    op.drop_column("documents", "share_token_revoked_at")
    op.drop_column("documents", "share_token_expires_at")
    op.drop_column("documents", "share_token_created_at")
