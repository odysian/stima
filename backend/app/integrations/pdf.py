"""PDF rendering integration using Jinja2 templates and WeasyPrint."""

from __future__ import annotations

from dataclasses import asdict
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML  # type: ignore[import-untyped]

from app.features.quotes.repository import QuoteRenderContext


class PdfRenderError(Exception):
    """Raised when quote PDF rendering fails."""


class PdfIntegration:
    """Render quote PDF bytes from template context."""

    def __init__(self, template_dir: Path | None = None) -> None:
        self._template_dir = template_dir or (Path(__file__).resolve().parent.parent / "templates")
        self._environment = Environment(
            loader=FileSystemLoader(str(self._template_dir)),
            autoescape=select_autoescape(["html", "xml"]),
            trim_blocks=True,
            lstrip_blocks=True,
        )

    def render(self, context: QuoteRenderContext) -> bytes:
        """Render a quote PDF and return raw bytes."""
        try:
            template = self._environment.get_template("quote.html")
            rendered_html = template.render(
                **asdict(context),
                show_updated_date=context.has_meaningful_update,
            )
            return HTML(string=rendered_html, base_url=str(self._template_dir)).write_pdf()
        except Exception as exc:  # noqa: BLE001
            raise PdfRenderError("Unable to render quote PDF") from exc
