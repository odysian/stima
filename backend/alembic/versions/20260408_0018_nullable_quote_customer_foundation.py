"""Allow nullable quote customers while guarding invoice rows.

Revision ID: 20260408_0018
Revises: 20260407_0017
Create Date: 2026-04-08
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260408_0018"
down_revision: str | None = "20260407_0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_INVOICE_CUSTOMER_REQUIRED_CHECK = "ck_documents_invoice_customer_required"


def upgrade() -> None:
    bind = op.get_bind()
    invalid_invoice_count = bind.execute(
        sa.text(
            """
            SELECT COUNT(*)
            FROM documents
            WHERE doc_type = 'invoice' AND customer_id IS NULL
            """
        )
    ).scalar_one()
    if invalid_invoice_count:
        raise RuntimeError(
            "Cannot add invoice customer guard while invoice rows still have NULL customer_id."
        )

    op.alter_column(
        "documents",
        "customer_id",
        existing_type=sa.Uuid(),
        nullable=True,
    )
    op.create_check_constraint(
        _INVOICE_CUSTOMER_REQUIRED_CHECK,
        "documents",
        "doc_type <> 'invoice' OR customer_id IS NOT NULL",
    )


def downgrade() -> None:
    bind = op.get_bind()
    nullable_quote_count = bind.execute(
        sa.text(
            """
            SELECT COUNT(*)
            FROM documents
            WHERE doc_type = 'quote' AND customer_id IS NULL
            """
        )
    ).scalar_one()
    if nullable_quote_count:
        raise RuntimeError(
            "Cannot restore NOT NULL on documents.customer_id while quote rows "
            "still have NULL customer_id."
        )

    op.drop_constraint(_INVOICE_CUSTOMER_REQUIRED_CHECK, "documents", type_="check")
    op.alter_column(
        "documents",
        "customer_id",
        existing_type=sa.Uuid(),
        nullable=False,
    )
