"""Add invoice document support.

Revision ID: 20260330_0012
Revises: 20260327_0011
Create Date: 2026-03-30
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260330_0012"
down_revision: str | None = "20260327_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_STATUS_CONSTRAINT = "quote_status"
_OLD_SEQUENCE_CONSTRAINT = "uq_documents_user_sequence"
_NEW_SEQUENCE_CONSTRAINT = "uq_documents_user_type_sequence"
_INVOICE_SOURCE_INDEX = "ix_documents_invoice_source_document_id_unique"
_EXPANDED_STATUSES = ("draft", "ready", "shared", "viewed", "approved", "declined", "sent")
_ORIGINAL_STATUSES = ("draft", "ready", "shared", "viewed", "approved", "declined")


def upgrade() -> None:
    op.drop_constraint(_STATUS_CONSTRAINT, "documents", type_="check")
    op.create_check_constraint(
        _STATUS_CONSTRAINT,
        "documents",
        _build_status_check(_EXPANDED_STATUSES),
    )

    op.drop_constraint(_OLD_SEQUENCE_CONSTRAINT, "documents", type_="unique")
    op.create_unique_constraint(
        _NEW_SEQUENCE_CONSTRAINT,
        "documents",
        ["user_id", "doc_type", "doc_sequence"],
    )

    op.add_column("documents", sa.Column("due_date", sa.Date(), nullable=True))
    op.create_index(
        _INVOICE_SOURCE_INDEX,
        "documents",
        ["source_document_id"],
        unique=True,
        postgresql_where=sa.text("doc_type = 'invoice'"),
        sqlite_where=sa.text("doc_type = 'invoice'"),
    )


def downgrade() -> None:
    op.drop_index(_INVOICE_SOURCE_INDEX, table_name="documents")
    op.drop_column("documents", "due_date")

    op.drop_constraint(_NEW_SEQUENCE_CONSTRAINT, "documents", type_="unique")
    op.create_unique_constraint(
        _OLD_SEQUENCE_CONSTRAINT,
        "documents",
        ["user_id", "doc_sequence"],
    )

    op.execute(
        sa.text(
            """
            UPDATE documents
            SET status = 'shared'
            WHERE status = 'sent'
            """
        )
    )
    op.drop_constraint(_STATUS_CONSTRAINT, "documents", type_="check")
    op.create_check_constraint(
        _STATUS_CONSTRAINT,
        "documents",
        _build_status_check(_ORIGINAL_STATUSES),
    )


def _build_status_check(statuses: Sequence[str]) -> str:
    quoted_statuses = ", ".join(f"'{status}'" for status in statuses)
    return f"status IN ({quoted_statuses})"
