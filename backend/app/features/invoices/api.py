"""Invoice API endpoints."""

from __future__ import annotations

from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.features.auth.models import User
from app.features.invoices.schemas import (
    InvoiceCreateRequest,
    InvoiceCustomerResponse,
    InvoiceDetailResponse,
    InvoiceListItemResponse,
    InvoiceResponse,
    InvoiceUpdateRequest,
)
from app.features.invoices.service import InvoiceService
from app.features.quotes.schemas import LineItemResponse
from app.features.quotes.service import QuoteServiceError
from app.shared.dependencies import get_current_user, get_invoice_service, require_csrf
from app.shared.pricing import DiscountType

router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.post(
    "",
    response_model=InvoiceResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_invoice(
    payload: InvoiceCreateRequest,
    user: Annotated[User, Depends(get_current_user)],
    invoice_service: Annotated[InvoiceService, Depends(get_invoice_service)],
) -> InvoiceResponse:
    """Create a direct invoice for the authenticated user."""
    try:
        invoice = await invoice_service.create_invoice(user, payload)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return InvoiceResponse.model_validate(invoice)


@router.get("", response_model=list[InvoiceListItemResponse])
async def list_invoices(
    user: Annotated[User, Depends(get_current_user)],
    invoice_service: Annotated[InvoiceService, Depends(get_invoice_service)],
    customer_id: Annotated[UUID | None, Query()] = None,
) -> list[InvoiceListItemResponse]:
    """List invoices for the authenticated user."""
    invoices = await invoice_service.list_invoices(user, customer_id=customer_id)
    return [InvoiceListItemResponse.model_validate(invoice) for invoice in invoices]


@router.get("/{invoice_id}", response_model=InvoiceDetailResponse)
async def get_invoice(
    invoice_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    invoice_service: Annotated[InvoiceService, Depends(get_invoice_service)],
) -> InvoiceDetailResponse:
    """Return one invoice owned by the authenticated user."""
    try:
        invoice = await invoice_service.get_invoice_detail(user, invoice_id)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return InvoiceDetailResponse(
        id=invoice.id,
        customer_id=invoice.customer_id,
        doc_number=invoice.doc_number,
        title=invoice.title,
        status=invoice.status,  # type: ignore[arg-type]
        total_amount=float(invoice.total_amount) if invoice.total_amount is not None else None,
        tax_rate=float(invoice.tax_rate) if invoice.tax_rate is not None else None,
        discount_type=cast(DiscountType | None, invoice.discount_type),
        discount_value=(
            float(invoice.discount_value) if invoice.discount_value is not None else None
        ),
        deposit_amount=(
            float(invoice.deposit_amount) if invoice.deposit_amount is not None else None
        ),
        notes=invoice.notes,
        due_date=invoice.due_date,
        shared_at=invoice.shared_at,
        share_token=invoice.share_token,
        source_document_id=invoice.source_document_id,
        source_quote_number=invoice.source_quote_number,
        line_items=[LineItemResponse.model_validate(line_item) for line_item in invoice.line_items],
        customer=InvoiceCustomerResponse(
            id=invoice.customer_id,
            name=invoice.customer_name,
            email=invoice.customer_email,
            phone=invoice.customer_phone,
        ),
        created_at=invoice.created_at,
        updated_at=invoice.updated_at,
    )


@router.patch(
    "/{invoice_id}",
    response_model=InvoiceResponse,
    dependencies=[Depends(require_csrf)],
)
async def update_invoice(
    invoice_id: UUID,
    payload: InvoiceUpdateRequest,
    user: Annotated[User, Depends(get_current_user)],
    invoice_service: Annotated[InvoiceService, Depends(get_invoice_service)],
) -> InvoiceResponse:
    """Patch editable invoice fields without changing invoice lifecycle state."""
    try:
        invoice = await invoice_service.update_invoice(user, invoice_id, payload)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return InvoiceResponse.model_validate(invoice)


@router.post(
    "/{invoice_id}/pdf",
    dependencies=[Depends(require_csrf)],
)
async def generate_invoice_pdf(
    invoice_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    invoice_service: Annotated[InvoiceService, Depends(get_invoice_service)],
) -> StreamingResponse:
    """Render a user-owned invoice to PDF and stream bytes inline."""
    try:
        doc_number, pdf_bytes = await invoice_service.generate_pdf(user, invoice_id)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return StreamingResponse(
        iter((pdf_bytes,)),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="invoice-{doc_number}.pdf"',
        },
    )


@router.post(
    "/{invoice_id}/share",
    response_model=InvoiceResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_csrf)],
)
async def share_invoice(
    invoice_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    invoice_service: Annotated[InvoiceService, Depends(get_invoice_service)],
) -> InvoiceResponse:
    """Create/reuse a share token and mark the invoice as sent."""
    try:
        invoice = await invoice_service.share_invoice(user, invoice_id)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return InvoiceResponse.model_validate(invoice)
