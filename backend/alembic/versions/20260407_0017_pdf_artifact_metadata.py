"""Add persisted PDF artifact metadata to documents and jobs.

Revision ID: 20260407_0017
Revises: 20260405_0016
Create Date: 2026-04-07
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260407_0017"
down_revision: str | None = "20260405_0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("pdf_artifact_path", sa.Text(), nullable=True))
    op.add_column(
        "documents",
        sa.Column(
            "pdf_artifact_revision",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column("documents", sa.Column("pdf_artifact_job_id", sa.Uuid(), nullable=True))
    op.create_index(
        "ix_documents_pdf_artifact_job_id",
        "documents",
        ["pdf_artifact_job_id"],
    )

    op.add_column("job_records", sa.Column("document_revision", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("job_records", "document_revision")

    op.drop_index("ix_documents_pdf_artifact_job_id", table_name="documents")
    op.drop_column("documents", "pdf_artifact_job_id")
    op.drop_column("documents", "pdf_artifact_revision")
    op.drop_column("documents", "pdf_artifact_path")
