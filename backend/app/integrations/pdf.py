"""PDF rendering integration using Jinja2 templates and WeasyPrint."""

from __future__ import annotations

from dataclasses import asdict
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML  # type: ignore[import-untyped]

from app.features.quotes.repository import QuoteRenderContext
from app.shared.input_limits import (
    CUSTOMER_ADDRESS_MAX_CHARS,
    DOCUMENT_LINE_ITEMS_MAX_ITEMS,
    DOCUMENT_NOTES_MAX_CHARS,
    LINE_ITEM_DESCRIPTION_MAX_CHARS,
    LINE_ITEM_DETAILS_MAX_CHARS,
)


class PdfRenderError(Exception):
    """Raised when document PDF rendering fails."""


class PdfRenderValidationError(PdfRenderError):
    """Raised when render context exceeds supported validation limits."""


class PdfRenderUnexpectedError(PdfRenderError):
    """Raised when renderer execution fails unexpectedly."""


class PdfIntegration:
    """Render document PDF bytes from template context."""

    def __init__(self, template_dir: Path | None = None) -> None:
        self._template_dir = template_dir or (Path(__file__).resolve().parent.parent / "templates")
        self._environment = Environment(
            loader=FileSystemLoader(str(self._template_dir)),
            autoescape=select_autoescape(["html", "xml"]),
            trim_blocks=True,
            lstrip_blocks=True,
        )

    def render(self, context: QuoteRenderContext) -> bytes:
        """Render a document PDF and return raw bytes."""
        try:
            validate_render_context(context)
            template = self._environment.get_template("quote.html")
            rendered_html = template.render(**asdict(context))
            return HTML(string=rendered_html, base_url=str(self._template_dir)).write_pdf()
        except PdfRenderError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise PdfRenderUnexpectedError("Unable to render document PDF") from exc


def validate_render_context(context: QuoteRenderContext) -> None:
    if len(context.line_items) > DOCUMENT_LINE_ITEMS_MAX_ITEMS:
        raise PdfRenderValidationError("Document exceeds supported render limits")
    if context.customer_address and len(context.customer_address) > CUSTOMER_ADDRESS_MAX_CHARS:
        raise PdfRenderValidationError("Document exceeds supported render limits")
    if context.notes and len(context.notes) > DOCUMENT_NOTES_MAX_CHARS:
        raise PdfRenderValidationError("Document exceeds supported render limits")

    for line_item in context.line_items:
        if len(line_item.description) > LINE_ITEM_DESCRIPTION_MAX_CHARS:
            raise PdfRenderValidationError("Document exceeds supported render limits")
        if line_item.details and len(line_item.details) > LINE_ITEM_DETAILS_MAX_CHARS:
            raise PdfRenderValidationError("Document exceeds supported render limits")


def is_retryable_pdf_error(exc: PdfRenderError) -> bool:
    """Return true when a PDF render failure is transient and worth retrying."""
    return isinstance(exc, PdfRenderUnexpectedError)
