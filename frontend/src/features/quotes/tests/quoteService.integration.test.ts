import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";

import { quoteService } from "@/features/quotes/services/quoteService";
import type {
  Quote,
  QuoteCreateRequest,
} from "@/features/quotes/types/quote.types";
import { clearCsrfToken, setCsrfToken } from "@/shared/lib/http";
import { server } from "@/shared/tests/mocks/server";

describe("quoteService integration (MSW)", () => {
  afterEach(() => {
    clearCsrfToken();
  });

  it("convertNotes returns parsed ExtractionResult and sends CSRF header", async () => {
    setCsrfToken("integration-csrf-token");
    let capturedCsrfHeader: string | null = null;

    server.use(
      http.post("/api/quotes/convert-notes", async ({ request }) => {
        capturedCsrfHeader = request.headers.get("X-CSRF-Token");
        const body = (await request.json()) as { notes: string };

        return HttpResponse.json({
          transcript: body.notes,
          line_items: [{ description: "Mulch", details: "5 yards", price: 120 }],
          total: 120,
          confidence_notes: [],
        });
      }),
    );

    const result = await quoteService.convertNotes("Mulch and edging");

    expect(capturedCsrfHeader).toBe("integration-csrf-token");
    expect(result).toEqual({
      transcript: "Mulch and edging",
      line_items: [{ description: "Mulch", details: "5 yards", price: 120 }],
      total: 120,
      confidence_notes: [],
    });
  });

  it("convertNotes propagates CSRF validation error when token is missing", async () => {
    clearCsrfToken();

    await expect(quoteService.convertNotes("Mulch and edging")).rejects.toThrow(
      "CSRF token missing",
    );
  });

  it("createQuote returns created Quote and sends CSRF header", async () => {
    setCsrfToken("integration-csrf-token");
    let capturedCsrfHeader: string | null = null;

    server.use(
      http.post("/api/quotes", async ({ request }) => {
        capturedCsrfHeader = request.headers.get("X-CSRF-Token");
        const body = (await request.json()) as QuoteCreateRequest;

        const response: Quote = {
          id: "quote-1",
          customer_id: body.customer_id,
          doc_number: "Q-001",
          status: "draft",
          source_type: "text",
          transcript: body.transcript,
          total_amount: body.total_amount,
          notes: body.notes,
          line_items: body.line_items.map((lineItem, index) => ({
            id: `line-${index + 1}`,
            description: lineItem.description,
            details: lineItem.details,
            price: lineItem.price,
            sort_order: index,
          })),
          created_at: "2026-03-20T00:00:00.000Z",
          updated_at: "2026-03-20T00:00:00.000Z",
        };

        return HttpResponse.json(response, { status: 201 });
      }),
    );

    const createdQuote = await quoteService.createQuote({
      customer_id: "cust-1",
      transcript: "Mulch and edging",
      line_items: [{ description: "Mulch", details: "5 yards", price: 120 }],
      total_amount: 120,
      notes: "Thank you",
    });

    expect(capturedCsrfHeader).toBe("integration-csrf-token");
    expect(createdQuote).toEqual({
      id: "quote-1",
      customer_id: "cust-1",
      doc_number: "Q-001",
      status: "draft",
      source_type: "text",
      transcript: "Mulch and edging",
      total_amount: 120,
      notes: "Thank you",
      line_items: [{ id: "line-1", description: "Mulch", details: "5 yards", price: 120, sort_order: 0 }],
      created_at: "2026-03-20T00:00:00.000Z",
      updated_at: "2026-03-20T00:00:00.000Z",
    });
  });
});
