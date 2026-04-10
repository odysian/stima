"""Add extraction outcome metadata columns to documents.

Revision ID: 20260410_0019
Revises: 20260408_0018
Create Date: 2026-04-10
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260410_0019"
down_revision: str | None = "20260408_0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_VALID_EXTRACTION_TIER_CHECK = "ck_documents_extraction_tier_valid"
_DEGRADED_REASON_REQUIRES_TIER_CHECK = "ck_documents_degraded_reason_requires_tier"
_INVOICE_EXTRACTION_FIELDS_NULL_CHECK = "ck_documents_invoice_extraction_fields_null"


def upgrade() -> None:
    op.add_column("documents", sa.Column("extraction_tier", sa.String(length=20), nullable=True))
    op.add_column(
        "documents",
        sa.Column("extraction_degraded_reason_code", sa.String(length=64), nullable=True),
    )
    op.create_check_constraint(
        _VALID_EXTRACTION_TIER_CHECK,
        "documents",
        "extraction_tier IS NULL OR extraction_tier IN ('primary', 'degraded')",
    )
    op.create_check_constraint(
        _DEGRADED_REASON_REQUIRES_TIER_CHECK,
        "documents",
        "extraction_degraded_reason_code IS NULL OR extraction_tier = 'degraded'",
    )
    op.create_check_constraint(
        _INVOICE_EXTRACTION_FIELDS_NULL_CHECK,
        "documents",
        "doc_type <> 'invoice' OR ("
        "extraction_tier IS NULL AND extraction_degraded_reason_code IS NULL"
        ")",
    )


def downgrade() -> None:
    op.drop_constraint(_INVOICE_EXTRACTION_FIELDS_NULL_CHECK, "documents", type_="check")
    op.drop_constraint(_DEGRADED_REASON_REQUIRES_TIER_CHECK, "documents", type_="check")
    op.drop_constraint(_VALID_EXTRACTION_TIER_CHECK, "documents", type_="check")
    op.drop_column("documents", "extraction_degraded_reason_code")
    op.drop_column("documents", "extraction_tier")
