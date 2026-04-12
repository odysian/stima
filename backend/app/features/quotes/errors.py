"""Quote-domain shared errors."""

from __future__ import annotations


class QuoteServiceError(Exception):
    """Quote-domain exception mapped to an HTTP status code."""

    def __init__(self, *, detail: str, status_code: int) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code
