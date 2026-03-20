import type {
  ExtractionResult,
  Quote,
  QuoteCreateRequest,
  QuoteUpdateRequest,
} from "@/features/quotes/types/quote.types";
import { request, requestBlob } from "@/shared/lib/http";

function convertNotes(notes: string): Promise<ExtractionResult> {
  return request<ExtractionResult>("/api/quotes/convert-notes", {
    method: "POST",
    body: { notes },
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
  createQuote,
  getQuote,
  updateQuote,
  generatePdf,
  shareQuote,
};
