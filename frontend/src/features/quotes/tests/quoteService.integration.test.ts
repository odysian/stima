import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";

import { quoteService } from "@/features/quotes/services/quoteService";
import type {
  Quote,
  QuoteDetail,
  QuoteCreateRequest,
  QuoteListItem,
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
          line_items: [
            {
              description: "Mulch",
              details: "5 yards",
              price: 120,
              flagged: true,
              flag_reason: "Unit phrasing may be ambiguous",
            },
          ],
          total: 120,
          confidence_notes: [],
        });
      }),
    );

    const result = await quoteService.convertNotes("Mulch and edging");

    expect(capturedCsrfHeader).toBe("integration-csrf-token");
    expect(result).toEqual({
      transcript: "Mulch and edging",
      line_items: [
        {
          description: "Mulch",
          details: "5 yards",
          price: 120,
          flagged: true,
          flag_reason: "Unit phrasing may be ambiguous",
        },
      ],
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
          title: body.title,
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
      title: "Front Yard Refresh",
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
      title: "Front Yard Refresh",
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

  it("getQuote returns quote detail contract including customer contact fields", async () => {
    const response: QuoteDetail = {
      id: "quote-1",
      customer_id: "cust-1",
      customer_name: "Alice Johnson",
      customer_email: "alice@example.com",
      customer_phone: "+1-555-0100",
      doc_number: "Q-001",
      title: null,
      status: "draft",
      source_type: "text",
      transcript: "Mulch and edging",
      total_amount: 120,
      notes: "Thank you",
      shared_at: null,
      share_token: null,
      line_items: [
        { id: "line-1", description: "Mulch", details: "5 yards", price: 120, sort_order: 0 },
      ],
      created_at: "2026-03-20T00:00:00.000Z",
      updated_at: "2026-03-20T00:00:00.000Z",
    };

    server.use(http.get("/api/quotes/:id", () => HttpResponse.json(response, { status: 200 })));

    const quote = await quoteService.getQuote("quote-1");

    expect(quote.customer_name).toBe("Alice Johnson");
    expect(quote.customer_email).toBe("alice@example.com");
    expect(quote.customer_phone).toBe("+1-555-0100");
  });

  it("listQuotes returns quote summary contract including customer_name", async () => {
    const response: QuoteListItem[] = [
      {
        id: "quote-2",
        customer_id: "cust-2",
        customer_name: "Bob Brown",
        doc_number: "Q-002",
        title: "Spring Cleanup",
        status: "ready",
        total_amount: null,
        item_count: 1,
        created_at: "2026-03-21T00:00:00.000Z",
      },
      {
        id: "quote-1",
        customer_id: "cust-1",
        customer_name: "Alice Johnson",
        doc_number: "Q-001",
        title: null,
        status: "draft",
        total_amount: 120,
        item_count: 1,
        created_at: "2026-03-20T00:00:00.000Z",
      },
    ];

    server.use(
      http.get("/api/quotes", () => HttpResponse.json(response, { status: 200 })),
    );

    const quotes = await quoteService.listQuotes();

    expect(quotes).toEqual(response);
    expect(quotes[0]).not.toHaveProperty("line_items");
  });

  it("listQuotes sends customer_id query param when provided", async () => {
    let capturedCustomerId: string | null = null;

    server.use(
      http.get("/api/quotes", ({ request }) => {
        capturedCustomerId = new URL(request.url).searchParams.get("customer_id");
        return HttpResponse.json([], { status: 200 });
      }),
    );

    await quoteService.listQuotes({ customer_id: "cust-1" });

    expect(capturedCustomerId).toBe("cust-1");
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
          line_items: [
            {
              description: "Mulch",
              details: "5 yards",
              price: 120,
              flagged: true,
              flag_reason: "Unit phrasing may be ambiguous",
            },
          ],
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
    expect(result).toEqual({
      transcript: "transcript from voice",
      line_items: [
        {
          description: "Mulch",
          details: "5 yards",
          price: 120,
          flagged: true,
          flag_reason: "Unit phrasing may be ambiguous",
        },
      ],
      total: 120,
      confidence_notes: [],
    });
  });

  it("extract sends multipart clips and trimmed notes", async () => {
    setCsrfToken("integration-csrf-token");
    let capturedCsrfHeader: string | null = null;
    let capturedContentType: string | null = null;

    server.use(
      http.post("/api/quotes/extract", async ({ request }) => {
        capturedCsrfHeader = request.headers.get("X-CSRF-Token");
        capturedContentType = request.headers.get("Content-Type");

        return HttpResponse.json({
          transcript: "combined transcript",
          line_items: [],
          total: null,
          confidence_notes: [],
        });
      }),
    );

    const result = await quoteService.extract({
      clips: [
        new Blob(["clip-1"], { type: "audio/webm" }),
        new Blob(["clip-2"], { type: "audio/mp4" }),
      ],
      notes: "  add 10% travel surcharge  ",
    });

    expect(capturedCsrfHeader).toBe("integration-csrf-token");
    expect(capturedContentType).not.toContain("application/json");
    expect(result.transcript).toBe("combined transcript");
  });

  it("extract sends notes without clips when notes-only", async () => {
    setCsrfToken("integration-csrf-token");

    server.use(
      http.post("/api/quotes/extract", async ({ request }) => {
        const capturedCsrfHeader = request.headers.get("X-CSRF-Token");

        return HttpResponse.json({
          transcript: capturedCsrfHeader ? "notes only transcript" : "missing csrf",
          line_items: [],
          total: null,
          confidence_notes: [],
        });
      }),
    );

    const result = await quoteService.extract({ notes: "typed note only" });

    expect(result.transcript).toBe("notes only transcript");
  });

  it("extract omits notes field when clips-only", async () => {
    setCsrfToken("integration-csrf-token");

    server.use(
      http.post("/api/quotes/extract", async ({ request }) => {
        const capturedCsrfHeader = request.headers.get("X-CSRF-Token");

        return HttpResponse.json({
          transcript: capturedCsrfHeader ? "clips only transcript" : "missing csrf",
          line_items: [],
          total: null,
          confidence_notes: [],
        });
      }),
    );

    const result = await quoteService.extract({
      clips: [new Blob(["clip-1"], { type: "audio/webm;codecs=opus" })],
    });

    expect(result.transcript).toBe("clips only transcript");
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

  it("deleteQuote sends CSRF header and resolves on 204", async () => {
    setCsrfToken("integration-csrf-token");
    let capturedCsrfHeader: string | null = null;

    server.use(
      http.delete("/api/quotes/:id", ({ request }) => {
        capturedCsrfHeader = request.headers.get("X-CSRF-Token");
        return new HttpResponse(null, {
          status: 204,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    await expect(quoteService.deleteQuote("quote-1")).resolves.toBeUndefined();
    expect(capturedCsrfHeader).toBe("integration-csrf-token");
  });

  it("shareQuote returns updated quote with share token", async () => {
    setCsrfToken("integration-csrf-token");

    server.use(
      http.post("/api/quotes/:id/share", ({ params }) =>
        HttpResponse.json({
          id: String(params.id),
          customer_id: "cust-1",
          doc_number: "Q-001",
          title: "Spring Cleanup",
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
