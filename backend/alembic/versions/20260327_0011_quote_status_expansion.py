"""Expand quote statuses and add source document linkage.

Revision ID: 20260327_0011
Revises: 20260326_0010
Create Date: 2026-03-27
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "20260327_0011"
down_revision: str | None = "20260326_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_QUOTE_STATUS_CONSTRAINT = "quote_status"
_SOURCE_DOCUMENT_FK = "fk_documents_source_document_id_documents"
_EXPANDED_STATUSES = ("draft", "ready", "shared", "viewed", "approved", "declined")
_ORIGINAL_STATUSES = ("draft", "ready", "shared")


def upgrade() -> None:
    op.drop_constraint(_QUOTE_STATUS_CONSTRAINT, "documents", type_="check")
    op.create_check_constraint(
        _QUOTE_STATUS_CONSTRAINT,
        "documents",
        _build_status_check(_EXPANDED_STATUSES),
    )

    op.add_column(
        "documents",
        sa.Column("source_document_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        _SOURCE_DOCUMENT_FK,
        "documents",
        "documents",
        ["source_document_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(_SOURCE_DOCUMENT_FK, "documents", type_="foreignkey")
    op.drop_column("documents", "source_document_id")

    op.execute(
        sa.text(
            """
            UPDATE documents
            SET status = 'shared'
            WHERE status IN ('viewed', 'approved', 'declined')
            """
        )
    )
    op.drop_constraint(_QUOTE_STATUS_CONSTRAINT, "documents", type_="check")
    op.create_check_constraint(
        _QUOTE_STATUS_CONSTRAINT,
        "documents",
        _build_status_check(_ORIGINAL_STATUSES),
    )


def _build_status_check(statuses: Sequence[str]) -> str:
    quoted_statuses = ", ".join(f"'{status}'" for status in statuses)
    return f"status IN ({quoted_statuses})"
