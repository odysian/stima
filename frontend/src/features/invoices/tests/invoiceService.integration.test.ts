import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";

import { invoiceService } from "@/features/invoices/services/invoiceService";
import { clearCsrfToken, setCsrfToken } from "@/shared/lib/http";
import { server } from "@/shared/tests/mocks/server";

describe("invoiceService integration (MSW)", () => {
  afterEach(() => {
    clearCsrfToken();
  });

  it("getInvoice returns the invoice detail contract", async () => {
    const invoice = await invoiceService.getInvoice("invoice-1");

    expect(invoice.doc_number).toBe("I-001");
    expect(invoice.source_quote_number).toBe("Q-001");
    expect(invoice.customer.name).toBe("Alice Johnson");
  });

  it("updateInvoice sends CSRF and persists the due date payload", async () => {
    setCsrfToken("invoice-csrf-token");
    let capturedCsrfHeader: string | null = null;
    let capturedDueDate: string | null = null;

    server.use(
      http.patch("/api/invoices/:id", async ({ request, params }) => {
        capturedCsrfHeader = request.headers.get("X-CSRF-Token");
        const body = (await request.json()) as { due_date: string };
        capturedDueDate = body.due_date;

        return HttpResponse.json(
          {
            id: String(params.id),
            customer_id: "cust-1",
            doc_number: "I-001",
            title: "Spring cleanup",
            status: "draft",
            total_amount: 120,
            notes: "Thanks for your business",
            due_date: body.due_date,
            shared_at: null,
            share_token: null,
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
            updated_at: "2026-03-20T00:10:00.000Z",
          },
          { status: 200 },
        );
      }),
    );

    const invoice = await invoiceService.updateInvoice("invoice-1", {
      due_date: "2026-04-30",
    });

    expect(capturedCsrfHeader).toBe("invoice-csrf-token");
    expect(capturedDueDate).toBe("2026-04-30");
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
});
