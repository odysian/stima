"""Invoice repository tests."""

from __future__ import annotations

from uuid import uuid4

import pytest
from app.features.invoices.repository import InvoiceRepository
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio


async def test_get_invoice_email_context_returns_none_for_unknown_invoice(
    db_session: AsyncSession,
) -> None:
    repo = InvoiceRepository(db_session)

    result = await repo.get_email_context(uuid4(), uuid4())

    assert result is None  # nosec B101 - pytest assertion
