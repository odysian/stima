"""Database constraint checks for quote and invoice document rows."""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.auth.models import User
from app.features.quotes.models import Document, QuoteStatus

pytestmark = pytest.mark.asyncio


async def test_invoice_rows_require_customer_id_at_db_layer(
    db_session: AsyncSession,
) -> None:
    user = User(
        email=f"user-{uuid4().hex[:12]}@example.com",
        password_hash="hash",  # nosec B106 - test-only stub value
    )
    db_session.add(user)
    await db_session.flush()

    db_session.add(
        Document(
            user_id=user.id,
            customer_id=None,
            doc_type="invoice",
            doc_sequence=1,
            doc_number="I-001",
            status=QuoteStatus.DRAFT,
            source_type="text",
            transcript="invoice transcript",
        )
    )

    with pytest.raises(IntegrityError):
        await db_session.flush()
