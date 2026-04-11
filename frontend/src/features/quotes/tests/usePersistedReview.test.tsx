import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePersistedReview } from "@/features/quotes/hooks/usePersistedReview";
import { invoiceService } from "@/features/invoices/services/invoiceService";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { InvoiceDetail } from "@/features/invoices/types/invoice.types";
import type { QuoteDetail } from "@/features/quotes/types/quote.types";
import { HttpRequestError } from "@/shared/lib/http";

vi.mock("@/features/quotes/services/quoteService", () => ({
  quoteService: {
    getQuote: vi.fn(),
  },
}));

vi.mock("@/features/invoices/services/invoiceService", () => ({
  invoiceService: {
    getInvoice: vi.fn(),
  },
}));

const mockedQuoteService = vi.mocked(quoteService);
const mockedInvoiceService = vi.mocked(invoiceService);

function makeQuote(overrides: Partial<QuoteDetail> = {}): QuoteDetail {
  return {
    id: "doc-1",
    customer_id: "cust-1",
    doc_type: "quote",
    extraction_tier: "primary",
    extraction_degraded_reason_code: null,
    customer_name: "Alice Johnson",
    customer_email: "alice@example.com",
    customer_phone: "+1-555-0100",
    doc_number: "Q-001",
    title: "Front Yard Refresh",
    status: "draft",
    source_type: "text",
    transcript: "5 yards brown mulch",
    total_amount: 120,
    tax_rate: null,
    discount_type: null,
    discount_value: null,
    deposit_amount: null,
    notes: "Thanks for your business",
    shared_at: null,
    share_token: null,
    has_active_share: false,
    requires_customer_assignment: false,
    can_reassign_customer: true,
    linked_invoice: null,
    pdf_artifact: {
      status: "missing",
      job_id: null,
      download_url: null,
      terminal_error: null,
    },
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
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<InvoiceDetail> = {}): InvoiceDetail {
  return {
    id: "doc-1",
    customer_id: "cust-1",
    doc_type: "invoice",
    doc_number: "I-001",
    title: "Spring cleanup",
    status: "ready",
    total_amount: 120,
    tax_rate: null,
    discount_type: null,
    discount_value: null,
    deposit_amount: null,
    notes: "Thanks for your business",
    due_date: "2026-04-19",
    shared_at: null,
    share_token: null,
    has_active_share: false,
    source_document_id: "quote-1",
    source_quote_number: "Q-001",
    pdf_artifact: {
      status: "missing",
      job_id: null,
      download_url: null,
      terminal_error: null,
    },
    customer: {
      id: "cust-1",
      name: "Alice Johnson",
      email: "alice@example.com",
      phone: "+1-555-0100",
    },
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
    ...overrides,
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
  mockedQuoteService.getQuote.mockReset();
  mockedInvoiceService.getInvoice.mockReset();
});

afterEach(() => {
  window.sessionStorage.clear();
});

describe("usePersistedReview", () => {
  it("preserves local edits when refreshing without draft reseed", async () => {
    const initialQuote = makeQuote();
    const refreshedQuote = makeQuote({ title: "Server Canonical Title" });

    mockedQuoteService.getQuote
      .mockResolvedValueOnce(initialQuote)
      .mockResolvedValueOnce(refreshedQuote);

    const { result } = renderHook(() => usePersistedReview("doc-1"));

    await waitFor(() => {
      expect(result.current.isLoadingDocument).toBe(false);
    });
    expect(result.current.draft?.title).toBe("Front Yard Refresh");

    act(() => {
      result.current.setDraft((currentDraft) => ({
        ...currentDraft,
        title: "Locally edited title",
      }));
    });

    await act(async () => {
      await result.current.refreshDocument();
    });

    await waitFor(() => {
      expect(result.current.document?.title).toBe("Server Canonical Title");
    });
    expect(result.current.draft?.title).toBe("Locally edited title");
  });

  it("re-seeds the draft when refreshDocument is called with reseedDraft", async () => {
    const initialQuote = makeQuote();
    const refreshedQuote = makeQuote({ title: "Server Canonical Title" });

    mockedQuoteService.getQuote
      .mockResolvedValueOnce(initialQuote)
      .mockResolvedValueOnce(refreshedQuote);

    const { result } = renderHook(() => usePersistedReview("doc-1"));

    await waitFor(() => {
      expect(result.current.isLoadingDocument).toBe(false);
    });

    act(() => {
      result.current.setDraft((currentDraft) => ({
        ...currentDraft,
        title: "Locally stale title",
      }));
    });

    await act(async () => {
      await result.current.refreshDocument({ reseedDraft: true });
    });

    await waitFor(() => {
      expect(result.current.draft?.title).toBe("Server Canonical Title");
    });
  });

  it("falls back to invoice endpoint when quote lookup returns not found", async () => {
    mockedQuoteService.getQuote.mockRejectedValueOnce(new HttpRequestError("Not found", 404, null));
    mockedInvoiceService.getInvoice.mockResolvedValueOnce(makeInvoice());

    const { result } = renderHook(() => usePersistedReview("doc-1"));

    await waitFor(() => {
      expect(result.current.isLoadingDocument).toBe(false);
    });

    expect(result.current.document?.doc_number).toBe("I-001");
    expect(result.current.draft?.docType).toBe("invoice");
  });

  it("propagates non-404 quote errors without falling back to invoice endpoint", async () => {
    mockedQuoteService.getQuote.mockRejectedValueOnce(
      new HttpRequestError("Internal Server Error", 500, null),
    );

    const { result } = renderHook(() => usePersistedReview("doc-1"));

    await waitFor(() => {
      expect(result.current.isLoadingDocument).toBe(false);
    });

    expect(result.current.loadError).toBeTruthy();
    expect(mockedInvoiceService.getInvoice).not.toHaveBeenCalled();
  });
});
