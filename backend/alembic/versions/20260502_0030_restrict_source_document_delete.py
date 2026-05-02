"""Restrict deleting source documents referenced by invoices.

Revision ID: 20260502_0030
Revises: 20260502_0029
Create Date: 2026-05-02
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260502_0030"
down_revision: str | None = "20260502_0029"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SOURCE_DOCUMENT_FK = "fk_documents_source_document_id_documents"


def upgrade() -> None:
    op.drop_constraint(_SOURCE_DOCUMENT_FK, "documents", type_="foreignkey")
    op.create_foreign_key(
        _SOURCE_DOCUMENT_FK,
        "documents",
        "documents",
        ["source_document_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint(_SOURCE_DOCUMENT_FK, "documents", type_="foreignkey")
    op.create_foreign_key(
        _SOURCE_DOCUMENT_FK,
        "documents",
        "documents",
        ["source_document_id"],
        ["id"],
        ondelete="SET NULL",
    )
