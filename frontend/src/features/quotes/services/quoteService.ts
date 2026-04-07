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
import { request, requestBlob, requestWithMetadata } from "@/shared/lib/http";

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

function captureAudio(clips: Blob[]): Promise<ExtractionResult> {
  const formData = new FormData();
  clips.forEach((clip, index) => {
    const extension = resolveAudioExtensionFromMimeType(clip.type);
    formData.append("clips", clip, `clip-${index + 1}.${extension}`);
  });

  return request<ExtractionResult>("/api/quotes/capture-audio", {
    method: "POST",
    body: formData,
  });
}

async function extract(params: { clips?: Blob[]; notes?: string }): Promise<QuoteExtractResponse> {
  const formData = new FormData();
  (params.clips ?? []).forEach((clip, index) => {
    const extension = resolveAudioExtensionFromMimeType(clip.type);
    formData.append("clips", clip, `clip-${index + 1}.${extension}`);
  });

  const notes = params.notes?.trim() ?? "";
  if (notes.length > 0) {
    formData.append("notes", notes);
  }

  const response = await requestWithMetadata<ExtractionResult | JobStatusResponse>("/api/quotes/extract", {
    method: "POST",
    body: formData,
  });

  if (response.status === 202) {
    return {
      type: "async",
      jobId: (response.data as JobStatusResponse).id,
    };
  }

  return {
    type: "sync",
    result: response.data as ExtractionResult,
  };
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

function generatePdf(id: string): Promise<Blob> {
  return requestBlob(`/api/quotes/${id}/pdf`, {
    method: "POST",
  });
}

function shareQuote(id: string): Promise<Quote> {
  return request<Quote>(`/api/quotes/${id}/share`, {
    method: "POST",
  });
}

async function sendQuoteEmail(id: string): Promise<JobStatusResponse> {
  const response = await requestWithMetadata<JobStatusResponse>(`/api/quotes/${id}/send-email`, {
    method: "POST",
    headers: {
      "Idempotency-Key": buildIdempotencyKey(),
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
  convertNotes,
  captureAudio,
  createQuote,
  listQuotes,
  getQuote,
  updateQuote,
  deleteQuote,
  generatePdf,
  shareQuote,
  sendQuoteEmail,
  markQuoteWon,
  markQuoteLost,
  convertToInvoice,
};
