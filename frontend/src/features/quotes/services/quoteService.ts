import type { Invoice } from "@/features/invoices/types/invoice.types";
import type {
  BulkActionRequest,
  BulkActionResponse,
  ExtractionResult,
  ExtractionReviewMetadata,
  ExtractionReviewMetadataUpdateRequest,
  JobStatusResponse,
  Quote,
  QuoteDetail,
  QuoteCreateRequest,
  QuoteExtractResponse,
  QuoteListItem,
  QuoteReuseCandidate,
  QuoteUpdateRequest,
} from "@/features/quotes/types/quote.types";
import { getAudioClip } from "@/features/quotes/offline/audioRepository";
import { AudioClipMissingError } from "@/features/quotes/offline/captureTypes";
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

async function buildExtractionFormDataFromIds(params: {
  clipIds?: string[];
  notes?: string;
  customerId?: string;
}): Promise<FormData> {
  const formData = new FormData();
  for (const [index, clipId] of (params.clipIds ?? []).entries()) {
    const clip = await getAudioClip(clipId);
    if (!clip) {
      throw new AudioClipMissingError(clipId);
    }
    const extension = resolveAudioExtensionFromMimeType(clip.mimeType);
    formData.append("clips", clip.blob, `clip-${index + 1}.${extension}`);
  }

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
  params: { clipIds?: string[]; notes?: string; customerId?: string; idempotencyKey?: string },
): Promise<QuoteExtractResponse> {
  const formData = await buildExtractionFormDataFromIds(params);
  const headers: HeadersInit = {};
  if (params.idempotencyKey) {
    headers["Idempotency-Key"] = params.idempotencyKey;
  }

  const response = await requestWithMetadata<PersistedExtractionPayload | JobStatusResponse>(path, {
    method: "POST",
    body: formData,
    headers,
  });

  if (response.status === 202) {
    return {
      type: "async",
      jobId: (response.data as JobStatusResponse).id,
    };
  }

  const persistedExtraction = response.data as PersistedExtractionPayload;
  const { quote_id: quoteId, ...result } = persistedExtraction;
  return {
    type: "sync",
    quoteId,
    result,
  };
}

async function extract(params: {
  clipIds?: string[];
  notes?: string;
  customerId?: string;
  idempotencyKey?: string;
}): Promise<QuoteExtractResponse> {
  const idempotencyKey = params.idempotencyKey ?? buildIdempotencyKey();
  return submitExtraction("/api/quotes/extract", {
    ...params,
    idempotencyKey,
  });
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

function listReuseCandidates(params?: { customer_id?: string; q?: string }): Promise<QuoteReuseCandidate[]> {
  const queryParams = new URLSearchParams();
  if (params?.customer_id) {
    queryParams.set("customer_id", params.customer_id);
  }
  if (params?.q?.trim()) {
    queryParams.set("q", params.q.trim());
  }
  const query = queryParams.toString();
  return request<QuoteReuseCandidate[]>(`/api/quotes/reuse-candidates${query ? `?${query}` : ""}`);
}

function getQuote(id: string): Promise<QuoteDetail> {
  return request<QuoteDetail>(`/api/quotes/${id}`);
}

function duplicateQuote(id: string): Promise<Quote> {
  return request<Quote>(`/api/quotes/${id}/duplicate`, {
    method: "POST",
  });
}

function updateQuote(id: string, data: QuoteUpdateRequest): Promise<Quote> {
  return request<Quote>(`/api/quotes/${id}`, {
    method: "PATCH",
    body: data,
  });
}

function updateExtractionReviewMetadata(
  id: string,
  data: ExtractionReviewMetadataUpdateRequest,
): Promise<ExtractionReviewMetadata> {
  return request<ExtractionReviewMetadata>(
    `/api/quotes/${id}/extraction-review-metadata`,
    {
      method: "PATCH",
      body: data,
    },
  );
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

function bulkAction(payload: BulkActionRequest): Promise<BulkActionResponse> {
  return request<BulkActionResponse>("/api/quotes/bulk-action", {
    method: "POST",
    body: payload,
  });
}

export const quoteService = {
  extract,
  createManualDraft,
  convertNotes,
  createQuote,
  listQuotes,
  listReuseCandidates,
  duplicateQuote,
  getQuote,
  updateQuote,
  updateExtractionReviewMetadata,
  deleteQuote,
  generatePdf,
  shareQuote,
  revokeShare,
  sendQuoteEmail,
  markQuoteWon,
  markQuoteLost,
  convertToInvoice,
  bulkAction,
};
