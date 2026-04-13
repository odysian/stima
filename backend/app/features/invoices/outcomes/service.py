"""Invoice outcome lifecycle orchestration."""

from __future__ import annotations

from typing import Literal, Protocol
from uuid import UUID

from app.features.quotes.errors import QuoteServiceError
from app.features.quotes.models import Document, QuoteStatus
from app.shared.event_logger import log_event

_INVOICE_OUTCOME_MUTABLE_STATUSES = frozenset(
    {
        QuoteStatus.SENT,
        QuoteStatus.PAID,
        QuoteStatus.VOID,
    }
)


class InvoiceOutcomeRepositoryProtocol(Protocol):
    """Repository behavior required by invoice outcome orchestration."""

    async def get_by_id(self, invoice_id: UUID, user_id: UUID) -> Document | None: ...

    async def commit(self) -> None: ...

    async def refresh(self, invoice: Document) -> Document: ...


class InvoiceOutcomeService:
    """Own paid/void invoice outcome transitions and event side effects."""

    def __init__(self, *, repository: InvoiceOutcomeRepositoryProtocol) -> None:
        self._repository = repository

    async def mark_invoice_paid(self, *, user_id: UUID, invoice_id: UUID) -> Document:
        """Mark one invoice as paid when the current status is mutable."""
        return await self._mark_invoice_outcome(
            user_id=user_id,
            invoice_id=invoice_id,
            next_status=QuoteStatus.PAID,
            event_name="invoice_paid",
            action_label="paid",
        )

    async def mark_invoice_voided(self, *, user_id: UUID, invoice_id: UUID) -> Document:
        """Mark one invoice as void when the current status is mutable."""
        return await self._mark_invoice_outcome(
            user_id=user_id,
            invoice_id=invoice_id,
            next_status=QuoteStatus.VOID,
            event_name="invoice_voided",
            action_label="void",
        )

    async def _mark_invoice_outcome(
        self,
        *,
        user_id: UUID,
        invoice_id: UUID,
        next_status: QuoteStatus,
        event_name: Literal["invoice_paid", "invoice_voided"],
        action_label: Literal["paid", "void"],
    ) -> Document:
        invoice = await self._repository.get_by_id(invoice_id, user_id)
        if invoice is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        if invoice.status == next_status:
            return invoice
        if invoice.status not in _INVOICE_OUTCOME_MUTABLE_STATUSES:
            raise QuoteServiceError(
                detail=f"Only sent, paid, or void invoices can be marked {action_label}.",
                status_code=409,
            )

        invoice.status = next_status
        await self._repository.commit()
        refreshed_invoice = await self._repository.refresh(invoice)
        log_event(
            event_name,
            user_id=user_id,
            invoice_id=refreshed_invoice.id,
            customer_id=refreshed_invoice.customer_id,
        )
        return refreshed_invoice
