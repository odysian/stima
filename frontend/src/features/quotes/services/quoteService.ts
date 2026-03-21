import type {
  ExtractionResult,
  Quote,
  QuoteCreateRequest,
  QuoteUpdateRequest,
} from "@/features/quotes/types/quote.types";
import { request, requestBlob } from "@/shared/lib/http";

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

function createQuote(data: QuoteCreateRequest): Promise<Quote> {
  return request<Quote>("/api/quotes", {
    method: "POST",
    body: data,
  });
}

function getQuote(id: string): Promise<Quote> {
  return request<Quote>(`/api/quotes/${id}`);
}

function updateQuote(id: string, data: QuoteUpdateRequest): Promise<Quote> {
  return request<Quote>(`/api/quotes/${id}`, {
    method: "PATCH",
    body: data,
  });
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

export const quoteService = {
  convertNotes,
  captureAudio,
  createQuote,
  getQuote,
  updateQuote,
  generatePdf,
  shareQuote,
};
