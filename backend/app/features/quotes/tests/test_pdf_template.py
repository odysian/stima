"""Quote PDF template rendering behavior tests."""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import pytest

from app.features.quotes.repository import QuoteRenderContext, QuoteRenderLineItem
from app.integrations.pdf import PdfIntegration


def _make_context(
    *,
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
