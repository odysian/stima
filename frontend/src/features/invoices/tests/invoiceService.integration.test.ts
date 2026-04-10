import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";

import { invoiceService } from "@/features/invoices/services/invoiceService";
import { clearCsrfToken, setCsrfToken } from "@/shared/lib/http";
import { server } from "@/shared/tests/mocks/server";

describe("invoiceService integration (MSW)", () => {
  afterEach(() => {
    clearCsrfToken();
  });

  it("createInvoice sends CSRF and returns a direct invoice", async () => {
    setCsrfToken("invoice-csrf-token");
    let capturedCsrfHeader: string | null = null;
    let capturedPayload: Record<string, unknown> | null = null;

    server.use(
      http.post("/api/invoices", async ({ request }) => {
        capturedCsrfHeader = request.headers.get("X-CSRF-Token");
        capturedPayload = (await request.json()) as Record<string, unknown>;

        return HttpResponse.json(
          {
            id: "invoice-1",
            customer_id: "cust-1",
            doc_number: "I-001",
            title: "Spring cleanup",
            status: "draft",
            total_amount: 120,
            tax_rate: null,
            discount_type: null,
            discount_value: null,
            deposit_amount: null,
            notes: "Thanks for your business",
            due_date: "2026-04-19",
            shared_at: null,
            share_token: null,
            source_document_id: null,
            line_items: [
              {
                id: "line-1",
                description: "Brown mulch",
                details: "5 yards",
                price: 120,
                sort_order: 0,
              },
            ],
            created_at: "2026-03-20T00:00:00.000Z",
            updated_at: "2026-03-20T00:00:00.000Z",
          },
          { status: 201 },
        );
      }),
    );

    const invoice = await invoiceService.createInvoice({
      customer_id: "cust-1",
      title: "Spring cleanup",
      transcript: "5 yards brown mulch",
      line_items: [
        { description: "Brown mulch", details: "5 yards", price: 120 },
      ],
      total_amount: 120,
      tax_rate: null,
      discount_type: null,
      discount_value: null,
      deposit_amount: null,
      notes: "Thanks for your business",
      source_type: "text",
    });

    expect(capturedCsrfHeader).toBe("invoice-csrf-token");
    expect(capturedPayload).toMatchObject({
      customer_id: "cust-1",
      title: "Spring cleanup",
      source_type: "text",
    });
    expect(invoice.doc_number).toBe("I-001");
    expect(invoice.source_document_id).toBeNull();
  });

  it("getInvoice returns the invoice detail contract", async () => {
    const invoice = await invoiceService.getInvoice("invoice-1");

    expect(invoice.doc_number).toBe("I-001");
    expect(invoice.source_quote_number).toBe("Q-001");
    expect(invoice.customer.name).toBe("Alice Johnson");
  });

  it("listInvoices returns the invoice summary contract", async () => {
    const invoices = await invoiceService.listInvoices();

    expect(invoices).toEqual([
      {
        id: "invoice-2",
        customer_id: "cust-2",
        customer_name: "Bob Brown",
        doc_number: "I-002",
        title: "Front bed refresh",
        status: "ready",
        total_amount: 220,
        due_date: "2026-04-22",
        created_at: "2026-03-21T00:00:00.000Z",
        source_document_id: null,
      },
      {
        id: "invoice-1",
        customer_id: "cust-1",
        customer_name: "Alice Johnson",
        doc_number: "I-001",
        title: "Spring cleanup",
        status: "draft",
        total_amount: 120,
        due_date: "2026-04-19",
        created_at: "2026-03-20T00:00:00.000Z",
        source_document_id: "quote-1",
      },
    ]);
  });

  it("listInvoices sends customer_id query param when provided", async () => {
    let capturedCustomerId: string | null = null;

    server.use(
      http.get("/api/invoices", ({ request }) => {
        capturedCustomerId = new URL(request.url).searchParams.get(
          "customer_id",
        );
        return HttpResponse.json([], { status: 200 });
      }),
    );

    await invoiceService.listInvoices({ customer_id: "cust-1" });

    expect(capturedCustomerId).toBe("cust-1");
  });

  it("updateInvoice sends CSRF and persists the full invoice patch payload", async () => {
    setCsrfToken("invoice-csrf-token");
    let capturedCsrfHeader: string | null = null;
    let capturedPayload: Record<string, unknown> | null = null;

    server.use(
      http.patch("/api/invoices/:id", async ({ request, params }) => {
        capturedCsrfHeader = request.headers.get("X-CSRF-Token");
        const body = (await request.json()) as {
          title?: string | null;
          line_items?: Array<{
            description: string;
            details: string | null;
            price: number | null;
          }>;
          total_amount?: number | null;
          notes?: string | null;
          due_date?: string;
        };
        capturedPayload = body as Record<string, unknown>;

        return HttpResponse.json(
          {
            id: String(params.id),
            customer_id: "cust-1",
            doc_number: "I-001",
            title: body.title ?? "Spring cleanup",
            status: "draft",
            total_amount: body.total_amount ?? 120,
            tax_rate: null,
            discount_type: null,
            discount_value: null,
            deposit_amount: null,
            notes: body.notes ?? "Thanks for your business",
            due_date: body.due_date ?? "2026-04-19",
            shared_at: null,
            share_token: null,
            source_document_id: "quote-1",
            line_items: (
              body.line_items ?? [
                {
                  description: "Brown mulch",
                  details: "5 yards",
                  price: 120,
                },
              ]
            ).map((lineItem, index) => ({
              id: `line-${index + 1}`,
              description: lineItem.description,
              details: lineItem.details,
              price: lineItem.price,
              sort_order: index,
            })),
            created_at: "2026-03-20T00:00:00.000Z",
            updated_at: "2026-03-20T00:10:00.000Z",
          },
          { status: 200 },
        );
      }),
    );

    const invoice = await invoiceService.updateInvoice("invoice-1", {
      title: "Updated invoice",
      line_items: [
        { description: "Final walkthrough", details: null, price: 90 },
      ],
      total_amount: 90,
      notes: "Updated note",
      due_date: "2026-04-30",
    });

    expect(capturedCsrfHeader).toBe("invoice-csrf-token");
    expect(capturedPayload).toEqual({
      title: "Updated invoice",
      line_items: [
        { description: "Final walkthrough", details: null, price: 90 },
      ],
      total_amount: 90,
      notes: "Updated note",
      due_date: "2026-04-30",
    });
    expect(invoice.title).toBe("Updated invoice");
    expect(invoice.total_amount).toBe(90);
    expect(invoice.notes).toBe("Updated note");
    expect(invoice.due_date).toBe("2026-04-30");
  });

  it("shareInvoice sends CSRF and returns the sent invoice", async () => {
    setCsrfToken("invoice-csrf-token");
    let capturedCsrfHeader: string | null = null;

    server.use(
      http.post("/api/invoices/:id/share", ({ request, params }) => {
        capturedCsrfHeader = request.headers.get("X-CSRF-Token");

        return HttpResponse.json(
          {
            id: String(params.id),
            customer_id: "cust-1",
            doc_number: "I-001",
            title: "Spring cleanup",
            status: "sent",
            total_amount: 120,
            tax_rate: null,
            discount_type: null,
            discount_value: null,
            deposit_amount: null,
            notes: "Thanks for your business",
            due_date: "2026-04-19",
            shared_at: "2026-03-20T00:15:00.000Z",
            share_token: "invoice-share-token-1",
            source_document_id: "quote-1",
            line_items: [
              {
                id: "line-1",
                description: "Brown mulch",
                details: "5 yards",
                price: 120,
                sort_order: 0,
              },
            ],
            created_at: "2026-03-20T00:00:00.000Z",
            updated_at: "2026-03-20T00:15:00.000Z",
          },
          { status: 200 },
        );
      }),
    );

    const invoice = await invoiceService.shareInvoice("invoice-1");

    expect(capturedCsrfHeader).toBe("invoice-csrf-token");
    expect(invoice.status).toBe("sent");
    expect(invoice.share_token).toBe("invoice-share-token-1");
  });

  it("sendInvoiceEmail sends CSRF + Idempotency-Key and returns job metadata", async () => {
    setCsrfToken("invoice-csrf-token");
    let capturedCsrfHeader: string | null = null;
    let capturedIdempotencyKeyHeader: string | null = null;

    server.use(
      http.post("/api/invoices/:id/send-email", ({ request, params }) => {
        capturedCsrfHeader = request.headers.get("X-CSRF-Token");
        capturedIdempotencyKeyHeader = request.headers.get("Idempotency-Key");

        return HttpResponse.json(
          {
            id: `job-email-invoice-${String(params.id)}`,
            user_id: "user-1",
            document_id: String(params.id),
            job_type: "email",
            status: "pending",
            attempts: 0,
            terminal_error: null,
            extraction_result: null,
            quote_id: null,
            created_at: "2026-03-20T00:00:00.000Z",
            updated_at: "2026-03-20T00:00:00.000Z",
          },
          { status: 202 },
        );
      }),
    );

    const job = await invoiceService.sendInvoiceEmail("invoice-1");

    expect(capturedCsrfHeader).toBe("invoice-csrf-token");
    expect(capturedIdempotencyKeyHeader).toBeTruthy();
    expect(job.id).toContain("job-email-invoice-");
    expect(job.job_type).toBe("email");
    expect(job.status).toBe("pending");
  });
});
