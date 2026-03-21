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
          source_type: body.source_type,
          transcript: body.transcript,
          total_amount: body.total_amount,
          notes: body.notes,
          shared_at: null,
          share_token: null,
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
      source_type: "text",
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
      shared_at: null,
      share_token: null,
      line_items: [{ id: "line-1", description: "Mulch", details: "5 yards", price: 120, sort_order: 0 }],
      created_at: "2026-03-20T00:00:00.000Z",
      updated_at: "2026-03-20T00:00:00.000Z",
    });
  });

  it("captureAudio sends multipart clips and returns ExtractionResult", async () => {
    setCsrfToken("integration-csrf-token");
    let capturedCsrfHeader: string | null = null;
    let capturedContentType: string | null = null;

    server.use(
      http.post("/api/quotes/capture-audio", async ({ request }) => {
        capturedCsrfHeader = request.headers.get("X-CSRF-Token");
        capturedContentType = request.headers.get("Content-Type");

        return HttpResponse.json({
          transcript: "transcript from voice",
          line_items: [{ description: "Mulch", details: "5 yards", price: 120 }],
          total: 120,
          confidence_notes: [],
        });
      }),
    );

    const result = await quoteService.captureAudio([
      new Blob(["clip-1"], { type: "audio/webm" }),
      new Blob(["clip-2"], { type: "audio/webm" }),
    ]);

    expect(capturedCsrfHeader).toBe("integration-csrf-token");
    expect(capturedContentType).not.toContain("application/json");
    expect(result.transcript).toBe("transcript from voice");
  });

  it("generatePdf returns Blob and sends CSRF header", async () => {
    setCsrfToken("integration-csrf-token");
    let capturedCsrfHeader: string | null = null;

    server.use(
      http.post("/api/quotes/:id/pdf", ({ request }) => {
        capturedCsrfHeader = request.headers.get("X-CSRF-Token");
        return new HttpResponse("mock-pdf-content", {
          status: 200,
          headers: { "Content-Type": "application/pdf" },
        });
      }),
    );

    const blob = await quoteService.generatePdf("quote-1");

    expect(capturedCsrfHeader).toBe("integration-csrf-token");
    expect(await blob.text()).toBe("mock-pdf-content");
  });

  it("shareQuote returns updated quote with share token", async () => {
    setCsrfToken("integration-csrf-token");

    server.use(
      http.post("/api/quotes/:id/share", ({ params }) =>
        HttpResponse.json({
          id: String(params.id),
          customer_id: "cust-1",
          doc_number: "Q-001",
          status: "shared",
          source_type: "text",
          transcript: "Mulch and edging",
          total_amount: 120,
          notes: "Thank you",
          shared_at: "2026-03-20T01:00:00.000Z",
          share_token: "share-token-1",
          line_items: [
            {
              id: "line-1",
              description: "Mulch",
              details: "5 yards",
              price: 120,
              sort_order: 0,
            },
          ],
          created_at: "2026-03-20T00:00:00.000Z",
          updated_at: "2026-03-20T01:00:00.000Z",
        }),
      ),
    );

    const shared = await quoteService.shareQuote("quote-1");

    expect(shared.status).toBe("shared");
    expect(shared.share_token).toBe("share-token-1");
    expect(shared.shared_at).toBe("2026-03-20T01:00:00.000Z");
  });
});
