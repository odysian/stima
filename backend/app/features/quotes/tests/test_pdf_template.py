"""Quote PDF template rendering behavior tests."""

from __future__ import annotations

import re
from datetime import UTC, datetime
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
    business_name: str | None = "Acme Landscaping",
    title: str | None = None,
    doc_label: str = "Quote",
    doc_number: str = "Q-201",
    due_date: str | None = None,
    updated_at: datetime | None = None,
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
    business_address_lines: list[str] | None = None,
    customer_address_lines: list[str] | None = None,
    notes: str | None = None,
    line_item_details: str | None = None,
    line_items: list[QuoteRenderLineItem] | None = None,
    subtotal_amount: Decimal | None = None,
    discount_type: str | None = None,
    discount_value: Decimal | None = None,
    discount_amount: Decimal | None = None,
    tax_rate: Decimal | None = None,
    tax_amount: Decimal | None = None,
    deposit_amount: Decimal | None = None,
    balance_due: Decimal | None = None,
) -> QuoteRenderContext:
    created_at = datetime(2026, 3, 1, 12, 0, tzinfo=UTC)
    return QuoteRenderContext(
        quote_id=uuid4(),
        user_id=uuid4(),
        customer_id=uuid4(),
        business_name=business_name,
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
        subtotal_amount=subtotal_amount,
        discount_type=discount_type,
        discount_value=discount_value,
        discount_amount=discount_amount,
        tax_rate=tax_rate,
        tax_amount=tax_amount,
        deposit_amount=deposit_amount,
        balance_due=balance_due,
        notes=notes,
        due_date=due_date,
        line_items=line_items
        if line_items is not None
        else [
            QuoteRenderLineItem(
                description="Leaf cleanup",
                details=line_item_details,
                price=line_item_price,
            )
        ],
        created_at=created_at,
        updated_at=updated_at or datetime(2026, 3, 1, 12, 6, tzinfo=UTC),
        issued_date="Mar 01, 2026",
        business_address_lines=business_address_lines or [],
        customer_address_lines=customer_address_lines or [],
    )


def test_render_does_not_show_generic_updated_date_metadata(
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
            line_item_price=Decimal("120.00"),
            total=Decimal("120.00"),
        )
    )

    assert result == b"fake-pdf"
    assert len(captured_html) == 1
    assert "Updated" not in captured_html[0]
    assert "Revised" not in captured_html[0]


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
    result = integration.render(
        _make_context(
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


def test_render_shows_conditional_pricing_breakdown_rows(
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
            line_item_price=Decimal("120.00"),
            subtotal_amount=Decimal("120.00"),
            discount_type="fixed",
            discount_value=Decimal("10.00"),
            discount_amount=Decimal("10.00"),
            tax_rate=Decimal("0.1000"),
            tax_amount=Decimal("11.00"),
            deposit_amount=Decimal("30.00"),
            total=Decimal("121.00"),
            balance_due=Decimal("91.00"),
        )
    )

    assert result == b"fake-pdf"
    assert len(captured_html) == 1
    rendered_html = captured_html[0]
    for label in ("Subtotal", "Discount", "Tax", "Total", "Deposit", "Balance Due"):
        assert label in rendered_html
    assert "$120.00" in rendered_html
    assert "$10.00" in rendered_html
    assert "$11.00" in rendered_html
    assert "$30.00" in rendered_html
    assert "$91.00" in rendered_html
    assert "-$30.00" not in rendered_html
    assert re.search(
        (
            r"<div class=\"total-row total-row--deposit\">\s*"
            r"<p class=\"total-label\">Deposit</p>\s*"
            r"<p class=\"total-amount\">\$30.00</p>"
        ),
        rendered_html,
        re.DOTALL,
    )


def test_render_omits_internal_quote_title_from_pdf(
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
            title="Front Yard Refresh",
            updated_at=updated_at,
            line_item_price=Decimal("120.00"),
            total=Decimal("120.00"),
        )
    )

    assert result == b"fake-pdf"
    assert len(captured_html) == 1
    rendered_html = captured_html[0]
    assert ("Quote Title" in rendered_html) is False
    assert "Front Yard Refresh" not in rendered_html
    assert 'class="quote-title"' not in rendered_html


def test_render_orders_customer_details_as_name_and_address_and_omits_phone_email(
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
            customer_address_lines=["123 Main St"],
            customer_phone="+1-555-000-1111",
            customer_email="customer@example.com",
        )
    )

    assert result == b"fake-pdf"
    rendered_html = captured_html[0]
    assert "customer@example.com" not in rendered_html
    assert re.search(
        (
            r"<p class=\"label\">Prepared For</p>\s*"
            r"<p class=\"value\">Jamie Customer</p>\s*"
            r"<p class=\"value\">123 Main St</p>"
        ),
        rendered_html,
        re.DOTALL,
    )
    assert "+1-555-000-1111" not in rendered_html


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


def test_render_preserves_multiline_customer_address_in_pdf(
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
            customer_address="123 Main St\nSuite 200",
        )
    )

    assert result == b"fake-pdf"
    rendered_html = captured_html[0]
    assert "value--multiline" in rendered_html
    assert "123 Main St\nSuite 200" in rendered_html


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
    assert re.search(
        (
            r"<tr>\s*<td class=\"meta-label-inline\">Invoice Number:</td>\s*"
            r"<td class=\"meta-value-inline\">I-201</td>\s*</tr>"
        ),
        rendered_html,
        re.DOTALL,
    )
    assert re.search(
        (
            r"<tr>\s*<td class=\"meta-label-inline\">Due Date:</td>\s*"
            r"<td class=\"meta-value-inline\">Apr 19, 2026</td>\s*</tr>"
        ),
        rendered_html,
        re.DOTALL,
    )
    assert "CUSTOMER SIGNATURE" not in rendered_html
    assert 'class="signature-area"' not in rendered_html


def test_render_shows_quote_signature_area_only_for_quote_doc_label(
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

    quote_result = integration.render(
        _make_context(
            doc_label="Quote",
            line_item_price=Decimal("120.00"),
            total=Decimal("120.00"),
        )
    )
    invoice_result = integration.render(
        _make_context(
            doc_label="Invoice",
            doc_number="I-201",
            line_item_price=Decimal("120.00"),
            total=Decimal("120.00"),
        )
    )

    assert quote_result == b"fake-pdf"
    assert invoice_result == b"fake-pdf"
    assert len(captured_html) == 2
    quote_html, invoice_html = captured_html
    assert "CUSTOMER SIGNATURE" in quote_html
    assert "ACCEPTANCE" not in quote_html.upper()
    assert "ACCEPTED BY" not in quote_html.upper()
    assert "ACCEPTANCE" not in invoice_html.upper()
    assert "ACCEPTED BY" not in invoice_html.upper()
    assert re.search(
        r"<p class=\"signature-field-label\">CUSTOMER SIGNATURE</p>",
        quote_html,
        re.DOTALL,
    )
    assert '<p class="signature-field-label">DATE</p>' not in quote_html
    assert 'class="signature-line"' in quote_html
    assert 'class="signature-label-row"' in quote_html
    assert re.search(r'class="notes-column(?:\s|")', quote_html)
    assert 'class="totals-stack totals-stack--with-signature"' in quote_html
    total_block_pos = quote_html.find('class="total-block"')
    signature_pos = quote_html.find('class="signature-area"')
    signature_line_pos = quote_html.find('class="signature-line"')
    signature_labels_pos = quote_html.find('class="signature-label-row"')
    assert total_block_pos != -1
    assert signature_pos != -1
    assert signature_line_pos != -1
    assert signature_labels_pos != -1
    assert total_block_pos < signature_pos
    assert signature_line_pos < signature_labels_pos
    assert "CUSTOMER SIGNATURE" not in invoice_html
    assert 'class="signature-area"' not in invoice_html


def test_render_includes_contractor_contact_details_in_header_only(
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
    assert "Prepared By" not in rendered_html
    assert 'class="header-contact"' in rendered_html
    assert re.search(
        r"<p class=\"header-contact\">\s*\+1-555-111-2222 • owner@example\.com\s*</p>",
        rendered_html,
        re.DOTALL,
    )


@pytest.mark.parametrize(
    ("phone_number", "contractor_email", "expected"),
    [
        ("+1-555-111-2222", None, "+1-555-111-2222"),
        (None, "owner@example.com", "owner@example.com"),
    ],
)
def test_render_contractor_contact_header_omits_dangling_separator_when_partial(
    monkeypatch: pytest.MonkeyPatch,
    phone_number: str | None,
    contractor_email: str | None,
    expected: str,
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
            phone_number=phone_number,
            contractor_email=contractor_email,
        )
    )

    assert result == b"fake-pdf"
    rendered_html = captured_html[0]
    assert re.search(
        rf"<p class=\"header-contact\">\s*{re.escape(expected)}\s*</p>",
        rendered_html,
        re.DOTALL,
    )
    assert "•" not in rendered_html


def test_render_contractor_contact_header_omits_row_when_phone_and_email_absent(
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
            phone_number=None,
            contractor_email=None,
            business_address_lines=[],
        )
    )

    assert result == b"fake-pdf"
    rendered_html = captured_html[0]
    assert 'class="header-contact"' not in rendered_html


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


def test_render_falls_back_to_owner_name_when_business_name_is_missing(
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
            business_name=None,
            first_name="Jamie",
            last_name="Owner",
            line_item_price=Decimal("120.00"),
            total=Decimal("120.00"),
        )
    )

    assert result == b"fake-pdf"
    rendered_html = captured_html[0]
    assert '<h1 class="company-name">Jamie Owner</h1>' in rendered_html
    assert 'class="owner-name"' not in rendered_html
    assert "Stima" not in rendered_html


def test_render_omits_company_name_when_business_and_owner_names_are_missing(
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
            business_name=None,
            first_name=None,
            last_name=None,
            line_item_price=Decimal("120.00"),
            total=Decimal("120.00"),
        )
    )

    assert result == b"fake-pdf"
    rendered_html = captured_html[0]
    assert 'class="company-name"' not in rendered_html
    assert "Stima" not in rendered_html


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
    assert "max-height: 84px" in captured_html[0]


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
    assert re.search(
        r"table\.line-items tbody td\s*\{[^}]*padding:\s*8px 8px;",
        rendered_html,
        re.DOTALL,
    )
    assert re.search(
        (
            r"\.line-item-description\s*\{[^}]*display:\s*block;"
            r"[^}]*overflow-wrap:\s*anywhere;"
        ),
        rendered_html,
        re.DOTALL,
    )
    assert re.search(
        (
            r"\.line-item-details\s*\{[^}]*margin-top:\s*1px;"
            r"[^}]*padding-left:\s*2ch;"
            r"[^}]*overflow-wrap:\s*anywhere;"
        ),
        rendered_html,
        re.DOTALL,
    )
    assert "overflow-wrap: break-word;" in rendered_html
    assert re.search(r"\.meta-right\s*\{[^}]*text-align:\s*right;", rendered_html, re.DOTALL)
    assert re.search(r"\.meta-details\s*\{[^}]*width:\s*auto;", rendered_html, re.DOTALL)
    assert re.search(r"\.meta-details\s*\{[^}]*margin-left:\s*auto;", rendered_html, re.DOTALL)
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
        (
            r"<tr>\s*<td class=\"meta-label-inline\">Quote Number:</td>\s*"
            r"<td class=\"meta-value-inline\">Q-201</td>\s*</tr>"
        ),
        rendered_html,
        re.DOTALL,
    )
    assert re.search(
        (
            r"<tr>\s*<td class=\"meta-label-inline\">Issued:</td>\s*"
            r"<td class=\"meta-value-inline\">Mar 01, 2026</td>\s*</tr>"
        ),
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
    assert ".post-content" in rendered_html
    assert 'class="post-content post-content--with-notes"' in rendered_html
    assert ".total-row--supporting" in rendered_html
    assert ".total-row--final" in rendered_html
    assert ".total-row--deposit" in rendered_html
    assert ".total-row--balance" in rendered_html
    assert re.search(
        (
            r"\.total-row--supporting \.total-amount\s*\{[^}]*font-size:\s*13px;"
            r"[^}]*font-weight:\s*500;"
        ),
        rendered_html,
        re.DOTALL,
    )
    assert re.search(
        r"\.total-row--final \.total-amount\s*\{[^}]*font-size:\s*17px;",
        rendered_html,
        re.DOTALL,
    )
    assert re.search(
        (
            r"\.total-row--deposit \.total-amount\s*\{[^}]*font-size:\s*14px;"
            r"[^}]*font-weight:\s*600;"
        ),
        rendered_html,
        re.DOTALL,
    )
    assert re.search(
        r"\.total-row--balance \.total-amount\s*\{[^}]*font-size:\s*18px;[^}]*font-weight:\s*700;",
        rendered_html,
        re.DOTALL,
    )
    assert re.search(r"\.totals-stack\s*\{[^}]*width:\s*220px;", rendered_html, re.DOTALL)
    assert re.search(
        (
            r"\.totals-stack--with-signature\s*\{[^}]*page-break-inside:\s*avoid;"
            r"[^}]*break-inside:\s*avoid-page;"
        ),
        rendered_html,
        re.DOTALL,
    )
    assert re.search(
        r"\.signature-area\s*\{[^}]*margin-top:\s*60px;",
        rendered_html,
        re.DOTALL,
    )
    assert re.search(
        r"\.signature-label-row\s*\{[^}]*justify-content:\s*flex-start;",
        rendered_html,
        re.DOTALL,
    )
    assert re.search(
        r"\.signature-label-row\s*\{[^}]*margin-top:\s*7px;",
        rendered_html,
        re.DOTALL,
    )
    assert re.search(
        r"\.signature-line\s*\{[^}]*border-bottom:\s*1px solid #111827;",
        rendered_html,
        re.DOTALL,
    )
    assert re.search(
        r"\.signature-field-label\s*\{[^}]*font-size:\s*10px;[^}]*text-transform:\s*uppercase;",
        rendered_html,
        re.DOTALL,
    )
    assert re.search(r"\.notes\s*\{[^}]*border-left:", rendered_html, re.DOTALL)
    assert "#9ca3af" in rendered_html
    assert not re.search(r"\.notes\s*\{[^}]*\bborder:", rendered_html, re.DOTALL)
    assert not re.search(r"\.notes\s*\{[^}]*background(?:-color)?:", rendered_html, re.DOTALL)
    line_items_table, total_block = rendered_html.split('<section class="total-block">', maxsplit=1)
    assert "</table>" in line_items_table
    assert "<table" not in total_block


def test_render_places_notes_in_left_column_with_totals_on_right_before_signature(
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
            line_item_price=Decimal("120.00"),
            total=Decimal("120.00"),
            notes="Call before arrival",
        )
    )

    assert result == b"fake-pdf"
    rendered_html = captured_html[0]
    assert 'class="post-content post-content--with-notes"' in rendered_html
    notes_pos = rendered_html.find('class="notes"')
    totals_pos = rendered_html.find('class="total-block"')
    signature_pos = rendered_html.find('class="signature-area"')
    assert notes_pos != -1
    assert totals_pos != -1
    assert signature_pos != -1
    assert notes_pos < totals_pos < signature_pos


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
    assert "CUSTOMER SIGNATURE" in rendered_html
    assert "ACCEPTED BY" not in rendered_html.upper()
    assert rendered_html.count("&mdash;") == 2


def test_render_handles_denser_quote_layout_without_placeholder_regressions(
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
            line_item_price=Decimal("120.00"),
            total=Decimal("780.00"),
            line_items=[
                QuoteRenderLineItem(
                    description=f"Line item {index}",
                    details="Detailed scope line",
                    price=Decimal("130.00"),
                )
                for index in range(1, 7)
            ],
            notes="Keep gate closed after service.",
        )
    )

    assert result == b"fake-pdf"
    rendered_html = captured_html[0]
    assert rendered_html.count('class="line-item-description"') == 6
    assert "page-break-inside: avoid;" in rendered_html
    assert "$None" not in rendered_html
    assert 'class="signature-area"' in rendered_html


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
            address_line1="456 Oak Ave",
            address_line2=None,
            city="Cleveland",
            state="OH",
            postal_code="44113",
        ),
        user=User(
            id=uuid4(),
            email="owner@example.com",
            password_hash="hashed",
            business_name="Acme Landscaping",
            business_address_line1="123 Main St",
            business_address_line2="Suite 200",
            business_city="Cleveland",
            business_state="OH",
            business_postal_code="44113",
            first_name="Taylor",
            last_name="Owner",
            trade_type="Landscaper",
            timezone="America/New_York",
        ),
    )

    assert context.issued_date == "Mar 24, 2026"
    assert context.title == "Front Yard Refresh"
    assert context.phone_number is None
    assert context.contractor_email == "owner@example.com"
    assert context.business_address_lines == [  # nosec B101 - pytest assertion
        "123 Main St",
        "Suite 200",
        "Cleveland, OH 44113",
    ]
    assert context.customer_address_lines == [  # nosec B101 - pytest assertion
        "456 Oak Ave",
        "Cleveland, OH 44113",
    ]


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
