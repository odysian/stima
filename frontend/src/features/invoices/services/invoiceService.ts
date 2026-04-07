import type {
  InvoiceCreateRequest,
  Invoice,
  InvoiceDetail,
  InvoiceListItem,
  InvoiceUpdateRequest,
} from "@/features/invoices/types/invoice.types";
import type { JobStatusResponse } from "@/features/quotes/types/quote.types";
import { request, requestBlob, requestWithMetadata } from "@/shared/lib/http";
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

function generatePdf(id: string): Promise<Blob> {
  return requestBlob(`/api/invoices/${id}/pdf`, {
    method: "POST",
  });
}

function shareInvoice(id: string): Promise<Invoice> {
  return request<Invoice>(`/api/invoices/${id}/share`, {
    method: "POST",
  });
}

async function sendInvoiceEmail(id: string): Promise<JobStatusResponse> {
  const response = await requestWithMetadata<JobStatusResponse>(`/api/invoices/${id}/send-email`, {
    method: "POST",
    headers: {
      "Idempotency-Key": buildIdempotencyKey(),
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
  sendInvoiceEmail,
};
