"""Quote PDF template rendering behavior tests."""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest

from app.features.auth.models import User
from app.features.customers.models import Customer
from app.features.quotes.models import Document, QuoteStatus
from app.features.quotes.repository import (
    QuoteRenderContext,
    QuoteRenderLineItem,
    _build_render_context,
)
from app.integrations.pdf import PdfIntegration


def _make_context(
    *,
    title: str | None = None,
    updated_at: datetime,
    line_item_price: Decimal | None,
    total: Decimal | None,
) -> QuoteRenderContext:
    created_at = datetime(2026, 3, 1, 12, 0, tzinfo=UTC)
    return QuoteRenderContext(
        business_name="Acme Landscaping",
        first_name="Taylor",
        last_name="Owner",
        customer_name="Jamie Customer",
        customer_phone=None,
        customer_email=None,
        customer_address=None,
        doc_number="Q-201",
        title=title,
        status="ready",
        total_amount=total,
        notes=None,
        line_items=[
            QuoteRenderLineItem(
                description="Leaf cleanup",
                details=None,
                price=line_item_price,
            )
        ],
        created_at=created_at,
        updated_at=updated_at,
        issued_date="Mar 01, 2026",
        updated_date=updated_at.strftime("%b %d, %Y"),
    )


@pytest.mark.parametrize(
    ("delta_seconds", "should_show_updated"),
    [
        (300, False),
        (301, True),
    ],
)
def test_render_shows_updated_date_only_when_delta_exceeds_threshold(
    monkeypatch: pytest.MonkeyPatch,
    delta_seconds: int,
    should_show_updated: bool,
) -> None:
    captured_html: list[str] = []

    class _FakeHTML:
        def __init__(self, *, string: str, base_url: str) -> None:
            del base_url
            captured_html.append(string)

        def write_pdf(self) -> bytes:
            return b"fake-pdf"

    monkeypatch.setattr("app.integrations.pdf.HTML", _FakeHTML)
    template_dir = Path(__file__).resolve().parents[3] / "templates"
    integration = PdfIntegration(template_dir=template_dir)
    updated_at = datetime(2026, 3, 1, 12, 0, tzinfo=UTC) + timedelta(seconds=delta_seconds)

    result = integration.render(
        _make_context(
            updated_at=updated_at,
            line_item_price=Decimal("120.00"),
            total=Decimal("120.00"),
        )
    )

    assert result == b"fake-pdf"
    assert len(captured_html) == 1
    assert ("Updated" in captured_html[0]) is should_show_updated


def test_render_blanks_null_line_item_and_total_prices(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured_html: list[str] = []

    class _FakeHTML:
        def __init__(self, *, string: str, base_url: str) -> None:
            del base_url
            captured_html.append(string)

        def write_pdf(self) -> bytes:
            return b"fake-pdf"

    monkeypatch.setattr("app.integrations.pdf.HTML", _FakeHTML)
    template_dir = Path(__file__).resolve().parents[3] / "templates"
    integration = PdfIntegration(template_dir=template_dir)
    updated_at = datetime(2026, 3, 1, 12, 6, tzinfo=UTC)

    result = integration.render(
        _make_context(
            updated_at=updated_at,
            line_item_price=None,
            total=None,
        )
    )

    assert result == b"fake-pdf"
    assert len(captured_html) == 1
    rendered_html = captured_html[0]
    assert "$0.00" not in rendered_html
    assert "$None" not in rendered_html
    assert re.search(
        r"<td>Leaf cleanup</td>\s*<td class=\"details\"></td>\s*<td class=\"price-col\">\s*</td>",
        rendered_html,
        re.DOTALL,
    )
    assert re.search(
        (
            r"<tr class=\"total-row\">\s*<td colspan=\"2\">Total</td>\s*"
            r"<td class=\"price-col\">\s*</td>"
        ),
        rendered_html,
        re.DOTALL,
    )


@pytest.mark.parametrize(
    ("title", "should_render_title"),
    [
        ("Front Yard Refresh", True),
        (None, False),
    ],
)
def test_render_shows_quote_title_only_when_present(
    monkeypatch: pytest.MonkeyPatch,
    title: str | None,
    should_render_title: bool,
) -> None:
    captured_html: list[str] = []

    class _FakeHTML:
        def __init__(self, *, string: str, base_url: str) -> None:
            del base_url
            captured_html.append(string)

        def write_pdf(self) -> bytes:
            return b"fake-pdf"

    monkeypatch.setattr("app.integrations.pdf.HTML", _FakeHTML)
    template_dir = Path(__file__).resolve().parents[3] / "templates"
    integration = PdfIntegration(template_dir=template_dir)
    updated_at = datetime(2026, 3, 1, 12, 6, tzinfo=UTC)

    result = integration.render(
        _make_context(
            title=title,
            updated_at=updated_at,
            line_item_price=Decimal("120.00"),
            total=Decimal("120.00"),
        )
    )

    assert result == b"fake-pdf"
    assert len(captured_html) == 1
    assert ("Quote Title" in captured_html[0]) is should_render_title
    assert ("Front Yard Refresh" in captured_html[0]) is should_render_title


def test_build_render_context_formats_dates_in_business_timezone() -> None:
    context = _build_render_context(
        document=Document(
            id=uuid4(),
            user_id=uuid4(),
            customer_id=uuid4(),
            doc_sequence=1,
            doc_number="Q-001",
            title="Front Yard Refresh",
            status=QuoteStatus.READY,
            source_type="text",
            transcript="Notes",
            total_amount=Decimal("120.00"),
            notes=None,
            created_at=datetime(2026, 3, 25, 0, 0, tzinfo=UTC),
            updated_at=datetime(2026, 3, 25, 0, 6, tzinfo=UTC),
            line_items=[],
        ),
        customer=Customer(
            id=uuid4(),
            user_id=uuid4(),
            name="Jamie Customer",
            phone=None,
            email=None,
            address=None,
        ),
        user=User(
            id=uuid4(),
            email="owner@example.com",
            password_hash="hashed",
            business_name="Acme Landscaping",
            first_name="Taylor",
            last_name="Owner",
            trade_type="Landscaper",
            timezone="America/New_York",
        ),
    )

    assert context.issued_date == "Mar 24, 2026"
    assert context.updated_date == "Mar 24, 2026"
    assert context.title == "Front Yard Refresh"
