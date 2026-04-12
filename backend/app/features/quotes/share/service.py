"""Owner-facing quote share lifecycle service."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Protocol
from uuid import UUID, uuid4

from app.features.quotes.errors import QuoteServiceError
from app.features.quotes.models import Document, QuoteStatus
from app.features.quotes.share.tokens import (
    _build_share_token_expiry,
    _share_token_has_expired,
)
from app.shared.event_logger import log_event

_POST_SHARE_NON_REGRESSION_STATUSES = frozenset(
    {
        QuoteStatus.VIEWED,
        QuoteStatus.APPROVED,
        QuoteStatus.DECLINED,
    }
)


class QuoteShareRepositoryProtocol(Protocol):
    """Repository behavior required by the quote share slice."""

    async def get_by_id(self, quote_id: UUID, user_id: UUID) -> Document | None: ...

    async def commit(self) -> None: ...

    async def refresh(self, document: Document) -> Document: ...


class QuoteShareService:
    """Own owner-facing quote share and revoke behavior."""

    def __init__(
        self,
        *,
        repository: QuoteShareRepositoryProtocol,
        ensure_quote_customer_assigned: Callable[[Document], None],
    ) -> None:
        self._repository = repository
        self._ensure_quote_customer_assigned = ensure_quote_customer_assigned

    async def share_quote(
        self,
        *,
        user_id: UUID,
        quote_id: UUID,
        regenerate: bool = False,
    ) -> Document:
        """Set share token/timestamp and transition quote status to shared."""
        quote = await self._repository.get_by_id(quote_id, user_id)
        if quote is None:
            raise QuoteServiceError(detail="Not found", status_code=404)

        self._ensure_quote_customer_assigned(quote)
        now = _utcnow()
        should_refresh_token = (
            regenerate
            or quote.share_token is None
            or quote.share_token_revoked_at is not None
            or _share_token_has_expired(quote.share_token_expires_at, now)
        )
        if quote.status in _POST_SHARE_NON_REGRESSION_STATUSES and not should_refresh_token:
            return quote

        if should_refresh_token:
            quote.share_token = str(uuid4())
            quote.share_token_created_at = now
            quote.share_token_expires_at = _build_share_token_expiry(now)
            quote.share_token_revoked_at = None

        if quote.status not in _POST_SHARE_NON_REGRESSION_STATUSES:
            quote.shared_at = now
            quote.status = QuoteStatus.SHARED
        elif quote.shared_at is None:
            quote.shared_at = now

        await self._repository.commit()
        refreshed_quote = await self._repository.refresh(quote)
        log_event(
            "quote_shared",
            user_id=user_id,
            quote_id=refreshed_quote.id,
            customer_id=refreshed_quote.customer_id,
        )
        return refreshed_quote

    async def revoke_public_share(self, *, user_id: UUID, quote_id: UUID) -> None:
        """Revoke the currently active public share token for one quote."""
        quote = await self._repository.get_by_id(quote_id, user_id)
        if quote is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        if quote.share_token is None or quote.share_token_revoked_at is not None:
            return

        quote.share_token_revoked_at = _utcnow()
        await self._repository.commit()


def _utcnow() -> datetime:
    return datetime.now(UTC)
