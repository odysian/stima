import type {
  InvoiceCreateRequest,
  Invoice,
  InvoiceDetail,
  InvoiceListItem,
  InvoiceUpdateRequest,
} from "@/features/invoices/types/invoice.types";
import type { JobStatusResponse } from "@/features/quotes/types/quote.types";
import { request, requestWithMetadata } from "@/shared/lib/http";
import { buildIdempotencyKey } from "@/shared/lib/idempotency";

function createInvoice(data: InvoiceCreateRequest): Promise<Invoice> {
  return request<Invoice>("/api/invoices", {
    method: "POST",
    body: data,
  });
}

function getInvoice(id: string): Promise<InvoiceDetail> {
  return request<InvoiceDetail>(`/api/invoices/${id}`);
}

function listInvoices(params?: { customer_id?: string }): Promise<InvoiceListItem[]> {
  const query = params?.customer_id ? `?customer_id=${params.customer_id}` : "";
  return request<InvoiceListItem[]>(`/api/invoices${query}`);
}

function updateInvoice(id: string, data: InvoiceUpdateRequest): Promise<Invoice> {
  return request<Invoice>(`/api/invoices/${id}`, {
    method: "PATCH",
    body: data,
  });
}

function generatePdf(id: string): Promise<JobStatusResponse> {
  return request<JobStatusResponse>(`/api/invoices/${id}/pdf`, {
    method: "POST",
  });
}

function shareInvoice(id: string): Promise<Invoice> {
  return request<Invoice>(`/api/invoices/${id}/share`, {
    method: "POST",
  });
}

function revokeShare(id: string): Promise<void> {
  return request<null>(`/api/invoices/${id}/share`, {
    method: "DELETE",
  }).then(() => undefined);
}

function markInvoicePaid(id: string): Promise<Invoice> {
  return request<Invoice>(`/api/invoices/${id}/mark-paid`, {
    method: "POST",
  });
}

function markInvoiceVoid(id: string): Promise<Invoice> {
  return request<Invoice>(`/api/invoices/${id}/mark-void`, {
    method: "POST",
  });
}

async function sendInvoiceEmail(id: string, idempotencyKey?: string): Promise<JobStatusResponse> {
  const response = await requestWithMetadata<JobStatusResponse>(`/api/invoices/${id}/send-email`, {
    method: "POST",
    headers: {
      "Idempotency-Key": idempotencyKey ?? buildIdempotencyKey(),
    },
  });

  return response.data;
}

export const invoiceService = {
  createInvoice,
  getInvoice,
  listInvoices,
  updateInvoice,
  generatePdf,
  shareInvoice,
  revokeShare,
  markInvoicePaid,
  markInvoiceVoid,
  sendInvoiceEmail,
};
