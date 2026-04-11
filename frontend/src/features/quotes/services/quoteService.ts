import type { Invoice } from "@/features/invoices/types/invoice.types";
import type {
  ExtractionResult,
  JobStatusResponse,
  Quote,
  QuoteDetail,
  QuoteCreateRequest,
  QuoteExtractResponse,
  QuoteListItem,
  QuoteUpdateRequest,
} from "@/features/quotes/types/quote.types";
import { buildIdempotencyKey } from "@/shared/lib/idempotency";
import { request, requestWithMetadata } from "@/shared/lib/http";

function resolveAudioExtensionFromMimeType(mimeType: string): string {
  const normalizedMimeType = mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (!normalizedMimeType || !normalizedMimeType.includes("/")) {
    return "webm";
  }

  const subtype = normalizedMimeType.split("/", 2)[1] ?? "";
  const normalizedSubtype = subtype.startsWith("x-") ? subtype.slice(2) : subtype;

  if (normalizedSubtype === "m4a" || normalizedSubtype === "aac") {
    return "m4a";
  }

  if (normalizedSubtype === "mpeg") {
    return "mp3";
  }

  if (normalizedSubtype.length === 0) {
    return "webm";
  }

  return normalizedSubtype;
}

function convertNotes(notes: string): Promise<ExtractionResult> {
  return request<ExtractionResult>("/api/quotes/convert-notes", {
    method: "POST",
    body: { notes },
  });
}

interface PersistedExtractionPayload extends ExtractionResult {
  quote_id: string;
}

function buildExtractionFormData(params: { clips?: Blob[]; notes?: string; customerId?: string }): FormData {
  const formData = new FormData();
  (params.clips ?? []).forEach((clip, index) => {
    const extension = resolveAudioExtensionFromMimeType(clip.type);
    formData.append("clips", clip, `clip-${index + 1}.${extension}`);
  });

  const notes = params.notes?.trim() ?? "";
  if (notes.length > 0) {
    formData.append("notes", notes);
  }

  if (params.customerId) {
    formData.append("customer_id", params.customerId);
  }

  return formData;
}

async function submitExtraction(
  path: string,
  params: { clips?: Blob[]; notes?: string; customerId?: string },
): Promise<QuoteExtractResponse> {
  const formData = buildExtractionFormData(params);

  const response = await requestWithMetadata<PersistedExtractionPayload | JobStatusResponse>(path, {
    method: "POST",
    body: formData,
  });

  if (response.status === 202) {
    return {
      type: "async",
      jobId: (response.data as JobStatusResponse).id,
    };
  }

  const persistedExtraction = response.data as PersistedExtractionPayload;
  return {
    type: "sync",
    quoteId: persistedExtraction.quote_id,
    result: {
      transcript: persistedExtraction.transcript,
      line_items: persistedExtraction.line_items,
      total: persistedExtraction.total,
      confidence_notes: persistedExtraction.confidence_notes,
      extraction_tier: persistedExtraction.extraction_tier,
      extraction_degraded_reason_code: persistedExtraction.extraction_degraded_reason_code,
    },
  };
}

async function extract(params: { clips?: Blob[]; notes?: string; customerId?: string }): Promise<QuoteExtractResponse> {
  return submitExtraction("/api/quotes/extract", params);
}

async function appendExtraction(
  quoteId: string,
  params: { clips?: Blob[]; notes?: string },
): Promise<QuoteExtractResponse> {
  return submitExtraction(`/api/quotes/${quoteId}/append-extraction`, params);
}

function createManualDraft(params?: { customerId?: string }): Promise<Quote> {
  return request<Quote>("/api/quotes/manual-draft", {
    method: "POST",
    body: params?.customerId ? { customer_id: params.customerId } : {},
  });
}

function createQuote(data: QuoteCreateRequest): Promise<Quote> {
  return request<Quote>("/api/quotes", {
    method: "POST",
    body: data,
  });
}

function listQuotes(params?: { customer_id?: string }): Promise<QuoteListItem[]> {
  const query = params?.customer_id ? `?customer_id=${params.customer_id}` : "";
  return request<QuoteListItem[]>(`/api/quotes${query}`);
}

function getQuote(id: string): Promise<QuoteDetail> {
  return request<QuoteDetail>(`/api/quotes/${id}`);
}

function updateQuote(id: string, data: QuoteUpdateRequest): Promise<Quote> {
  return request<Quote>(`/api/quotes/${id}`, {
    method: "PATCH",
    body: data,
  });
}

function deleteQuote(id: string): Promise<void> {
  // 204 No Content responses parse as null before we normalize back to void.
  return request<null>(`/api/quotes/${id}`, {
    method: "DELETE",
  }).then(() => undefined);
}

function generatePdf(id: string): Promise<JobStatusResponse> {
  return request<JobStatusResponse>(`/api/quotes/${id}/pdf`, {
    method: "POST",
  });
}

function shareQuote(id: string): Promise<Quote> {
  return request<Quote>(`/api/quotes/${id}/share`, {
    method: "POST",
  });
}

function revokeShare(id: string): Promise<void> {
  return request<null>(`/api/quotes/${id}/share`, {
    method: "DELETE",
  }).then(() => undefined);
}

async function sendQuoteEmail(id: string, idempotencyKey?: string): Promise<JobStatusResponse> {
  const response = await requestWithMetadata<JobStatusResponse>(`/api/quotes/${id}/send-email`, {
    method: "POST",
    headers: {
      "Idempotency-Key": idempotencyKey ?? buildIdempotencyKey(),
    },
  });

  return response.data;
}

function markQuoteWon(id: string): Promise<Quote> {
  return request<Quote>(`/api/quotes/${id}/mark-won`, {
    method: "POST",
  });
}

function markQuoteLost(id: string): Promise<Quote> {
  return request<Quote>(`/api/quotes/${id}/mark-lost`, {
    method: "POST",
  });
}

function convertToInvoice(id: string): Promise<Invoice> {
  return request<Invoice>(`/api/quotes/${id}/convert-to-invoice`, {
    method: "POST",
  });
}

export const quoteService = {
  extract,
  appendExtraction,
  createManualDraft,
  convertNotes,
  createQuote,
  listQuotes,
  getQuote,
  updateQuote,
  deleteQuote,
  generatePdf,
  shareQuote,
  revokeShare,
  sendQuoteEmail,
  markQuoteWon,
  markQuoteLost,
  convertToInvoice,
};
