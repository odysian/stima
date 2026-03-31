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
    doc_label: str = "Quote",
    doc_number: str = "Q-201",
    due_date: str | None = None,
    updated_at: datetime,
    line_item_price: Decimal | None,
    total: Decimal | None,
    logo_data_uri: str | None = None,
    first_name: str | None = "Taylor",
    last_name: str | None = "Owner",
    phone_number: str | None = None,
    contractor_email: str | None = None,
    customer_phone: str | None = None,
    customer_email: str | None = None,
    customer_address: str | None = None,
    notes: str | None = None,
    line_item_details: str | None = None,
) -> QuoteRenderContext:
    created_at = datetime(2026, 3, 1, 12, 0, tzinfo=UTC)
    return QuoteRenderContext(
        quote_id=uuid4(),
        user_id=uuid4(),
        customer_id=uuid4(),
        business_name="Acme Landscaping",
        first_name=first_name,
        last_name=last_name,
        phone_number=phone_number,
        contractor_email=contractor_email,
        logo_path=None,
        logo_data_uri=logo_data_uri,
        customer_name="Jamie Customer",
        customer_phone=customer_phone,
        customer_email=customer_email,
        customer_address=customer_address,
        doc_number=doc_number,
        doc_label=doc_label,
        title=title,
        status="ready",
        total_amount=total,
        notes=notes,
        due_date=due_date,
        line_items=[
            QuoteRenderLineItem(
                description="Leaf cleanup",
                details=line_item_details,
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
    assert "Revised" not in captured_html[0]
    if should_show_updated:
        assert re.search(
            (
                r"<p class=\"label\" style=\"margin-top: 10px\">Issued</p>\s*"
                r"<p class=\"value\">Mar 01, 2026</p>\s*"
                r"<p class=\"label\" style=\"margin-top: 10px\">Updated</p>\s*"
                r"<p class=\"value\">Mar 01, 2026</p>"
            ),
            captured_html[0],
            re.DOTALL,
        )


def test_render_shows_em_dash_for_null_line_item_and_total_prices(
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
    assert rendered_html.count("&mdash;") == 2
    assert re.search(
        (
            r"<td>\s*<span class=\"line-item-description\">Leaf cleanup</span>\s*</td>\s*"
            r"<td class=\"price-col\">\s*&mdash;\s*</td>"
        ),
        rendered_html,
        re.DOTALL,
    )
    assert re.search(
        r"<section class=\"total-block\">.*?<p class=\"total-amount\">\s*&mdash;\s*</p>",
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
    rendered_html = captured_html[0]
    assert ("Quote Title" in rendered_html) is False
    assert ("Front Yard Refresh" in rendered_html) is should_render_title
    assert ('class="quote-title"' in rendered_html) is should_render_title


def test_render_stacks_line_item_details_in_description_column(
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

    result = integration.render(
        _make_context(
            updated_at=datetime(2026, 3, 1, 12, 6, tzinfo=UTC),
            line_item_price=Decimal("120.00"),
            total=Decimal("120.00"),
            line_item_details="Bag and haul debris",
        )
    )

    assert result == b"fake-pdf"
    rendered_html = captured_html[0]
    assert "line-item-details" in rendered_html
    assert re.search(
        (
            r"<td>\s*<span class=\"line-item-description\">Leaf cleanup</span>\s*"
            r"<span class=\"line-item-details\">Bag and haul debris</span>\s*</td>"
        ),
        rendered_html,
        re.DOTALL,
    )
    assert "<th>Details</th>" not in rendered_html


def test_render_includes_due_date_and_doc_label_for_invoices(
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

    result = integration.render(
        _make_context(
            doc_label="Invoice",
            doc_number="I-201",
            due_date="Apr 19, 2026",
            updated_at=datetime(2026, 3, 1, 12, 6, tzinfo=UTC),
            line_item_price=Decimal("120.00"),
            total=Decimal("120.00"),
        )
    )

    assert result == b"fake-pdf"
    rendered_html = captured_html[0]
    assert "Invoice Number" in rendered_html
    assert "I-201" in rendered_html
    assert "Issued" in rendered_html
    assert "Due Date" in rendered_html
    assert "Apr 19, 2026" in rendered_html


def test_render_includes_contractor_contact_details_when_present(
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

    result = integration.render(
        _make_context(
            updated_at=datetime(2026, 3, 1, 12, 6, tzinfo=UTC),
            line_item_price=Decimal("120.00"),
            total=Decimal("120.00"),
            phone_number="+1-555-111-2222",
            contractor_email="owner@example.com",
        )
    )

    assert result == b"fake-pdf"
    rendered_html = captured_html[0]
    assert "+1-555-111-2222" in rendered_html
    assert "owner@example.com" in rendered_html


def test_render_hides_owner_name_when_both_name_fields_are_null(
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

    result = integration.render(
        _make_context(
            updated_at=datetime(2026, 3, 1, 12, 6, tzinfo=UTC),
            line_item_price=Decimal("120.00"),
            total=Decimal("120.00"),
            first_name=None,
            last_name=None,
        )
    )

    assert result == b"fake-pdf"
    assert 'class="owner-name"' not in captured_html[0]


def test_render_includes_logo_image_only_when_logo_data_uri_is_present(
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
            line_item_price=Decimal("120.00"),
            total=Decimal("120.00"),
            logo_data_uri="data:image/png;base64,ZmFrZS1sb2dv",
        )
    )

    assert result == b"fake-pdf"
    assert len(captured_html) == 1
    assert 'class="company-logo"' in captured_html[0]
    assert "max-height: 56px" in captured_html[0]


def test_render_uses_a4_page_size_and_polished_quote_layout_styles(
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

    result = integration.render(
        _make_context(
            updated_at=datetime(2026, 3, 1, 12, 6, tzinfo=UTC),
            line_item_price=Decimal("120.00"),
            total=Decimal("120.00"),
            notes="Call before arrival",
        )
    )

    assert result == b"fake-pdf"
    rendered_html = captured_html[0]
    assert "@page" in rendered_html
    assert "size: A4;" in rendered_html
    assert "margin: 18mm;" in rendered_html
    assert "@bottom-center" in rendered_html
    assert 'content: "Page " counter(page) " of " counter(pages);' in rendered_html
    assert "page-break-inside: avoid;" in rendered_html
    assert "overflow-wrap: break-word;" in rendered_html
    assert re.search(r"\.meta-right\s*\{[^}]*text-align:\s*right;", rendered_html, re.DOTALL)
    assert 'class="meta-right"' in rendered_html
    assert re.search(
        (
            r"<table class=\"meta-grid\">.*?<tr>\s*<td>.*?</td>\s*"
            r"<td class=\"meta-right\">"
        ),
        rendered_html,
        re.DOTALL,
    )
    assert re.search(
        r"<p class=\"label\">Quote Number</p>\s*<p class=\"value\">Q-201</p>",
        rendered_html,
        re.DOTALL,
    )
    assert re.search(
        r"<p class=\"label\" style=\"margin-top: 10px\">Issued</p>\s*<p class=\"value\">Mar 01, 2026</p>",
        rendered_html,
        re.DOTALL,
    )
    assert re.search(
        r"\.header-doc-type\s*\{[^}]*font-size:\s*28px;[^}]*text-transform:\s*uppercase;",
        rendered_html,
        re.DOTALL,
    )
    assert re.search(
        (
            r"<td class=\"header-logo-cell\">\s*"
            r"(?:<img class=\"company-logo\"[^>]*>\s*)?"
            r"<p class=\"header-doc-type\">Quote</p>\s*</td>"
        ),
        rendered_html,
        re.DOTALL,
    )
    assert "table.line-items thead th.price-col" in rendered_html
    assert re.search(
        r"table\.line-items thead th\.price-col\s*\{[^}]*text-align:\s*right;",
        rendered_html,
        re.DOTALL,
    )
    assert re.search(r"<th class=\"price-col\">Price</th>", rendered_html)
    assert ".total-amount" in rendered_html
    assert "font-weight: 700;" in rendered_html
    assert "font-size: 16px;" in rendered_html
    assert re.search(r"\.total-block\s*\{[^}]*border-top:", rendered_html, re.DOTALL)
    assert re.search(r"\.notes\s*\{[^}]*border-left:", rendered_html, re.DOTALL)
    assert "#9ca3af" in rendered_html
    assert not re.search(r"\.notes\s*\{[^}]*\bborder:", rendered_html, re.DOTALL)
    assert not re.search(r"\.notes\s*\{[^}]*background(?:-color)?:", rendered_html, re.DOTALL)
    line_items_table, total_block = rendered_html.split('<section class="total-block">', maxsplit=1)
    assert "</table>" in line_items_table
    assert "<table" not in total_block


def test_render_handles_sparse_quote_without_blank_placeholders(
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

    result = integration.render(
        _make_context(
            updated_at=datetime(2026, 3, 1, 12, 6, tzinfo=UTC),
            title=None,
            line_item_price=None,
            total=None,
            logo_data_uri=None,
            customer_phone=None,
            customer_email=None,
            customer_address=None,
            notes=None,
            line_item_details=None,
        )
    )

    assert result == b"fake-pdf"
    rendered_html = captured_html[0]
    assert 'class="header-doc-type"' in rendered_html
    assert 'class="quote-title"' not in rendered_html
    assert 'class="company-logo"' not in rendered_html
    assert 'class="notes"' not in rendered_html
    assert 'class="line-item-details"' not in rendered_html
    assert rendered_html.count("&mdash;") == 2


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
    assert context.phone_number is None
    assert context.contractor_email == "owner@example.com"


def test_build_render_context_keeps_invoice_due_date_calendar_day_in_non_utc_timezone() -> None:
    context = _build_render_context(
        document=Document(
            id=uuid4(),
            user_id=uuid4(),
            customer_id=uuid4(),
            doc_type="invoice",
            doc_sequence=1,
            doc_number="I-001",
            title="Front Yard Refresh",
            status=QuoteStatus.READY,
            source_type="text",
            transcript="Notes",
            total_amount=Decimal("120.00"),
            notes=None,
            due_date=datetime(2026, 4, 19, tzinfo=UTC).date(),
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

    assert context.due_date == "Apr 19, 2026"
