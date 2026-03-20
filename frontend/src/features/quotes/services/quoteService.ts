import type {
  ExtractionResult,
  Quote,
  QuoteCreateRequest,
  QuoteUpdateRequest,
} from "@/features/quotes/types/quote.types";
import { request } from "@/shared/lib/http";

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

export const quoteService = {
  convertNotes,
  createQuote,
  getQuote,
  updateQuote,
};
