import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePersistedReview } from "@/features/quotes/hooks/usePersistedReview";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteDetail } from "@/features/quotes/types/quote.types";

vi.mock("@/features/quotes/services/quoteService", () => ({
  quoteService: {
    getQuote: vi.fn(),
  },
}));

const mockedQuoteService = vi.mocked(quoteService);

function makeQuote(overrides: Partial<QuoteDetail> = {}): QuoteDetail {
  return {
    id: "quote-1",
    customer_id: "cust-1",
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

beforeEach(() => {
  window.sessionStorage.clear();
  mockedQuoteService.getQuote.mockReset();
});

afterEach(() => {
  window.sessionStorage.clear();
});

describe("usePersistedReview", () => {
  it("preserves local edits when refreshing without draft reseed", async () => {
    const initialQuote = makeQuote();
    const refreshedQuote = makeQuote({
      title: "Server Canonical Title",
      transcript: "Server canonical transcript",
      line_items: [
        {
          id: "line-2",
          description: "Edging",
          details: "40 linear ft",
          price: 200,
          sort_order: 0,
        },
      ],
      total_amount: 200,
      updated_at: "2026-03-20T01:00:00.000Z",
    });

    mockedQuoteService.getQuote
      .mockResolvedValueOnce(initialQuote)
      .mockResolvedValueOnce(refreshedQuote);

    const { result } = renderHook(() => usePersistedReview("quote-1"));

    await waitFor(() => {
      expect(result.current.isLoadingQuote).toBe(false);
    });
    expect(result.current.draft?.title).toBe("Front Yard Refresh");

    act(() => {
      result.current.setDraft((currentDraft) => ({
        ...currentDraft,
        title: "Locally edited title",
      }));
    });

    await act(async () => {
      await result.current.refreshQuote();
    });

    await waitFor(() => {
      expect(result.current.quote?.title).toBe("Server Canonical Title");
    });
    expect(result.current.draft?.title).toBe("Locally edited title");
  });

  it("re-seeds the draft from refreshed canonical quote data when requested", async () => {
    const initialQuote = makeQuote();
    const refreshedQuote = makeQuote({
      title: "Server Canonical Title",
      transcript: "Server canonical transcript",
      line_items: [
        {
          id: "line-2",
          description: "Edging",
          details: "40 linear ft",
          price: 200,
          sort_order: 0,
        },
      ],
      total_amount: 200,
      updated_at: "2026-03-20T01:00:00.000Z",
    });

    mockedQuoteService.getQuote
      .mockResolvedValueOnce(initialQuote)
      .mockResolvedValueOnce(refreshedQuote);

    const { result } = renderHook(() => usePersistedReview("quote-1"));

    await waitFor(() => {
      expect(result.current.isLoadingQuote).toBe(false);
    });
    expect(result.current.draft?.title).toBe("Front Yard Refresh");

    act(() => {
      result.current.setDraft((currentDraft) => ({
        ...currentDraft,
        title: "Locally stale title",
      }));
    });
    expect(result.current.draft?.title).toBe("Locally stale title");

    await act(async () => {
      await result.current.refreshQuote({ reseedDraft: true });
    });

    await waitFor(() => {
      expect(result.current.draft?.title).toBe("Server Canonical Title");
    });
    expect(result.current.draft?.transcript).toBe("Server canonical transcript");
    expect(result.current.draft?.lineItems).toEqual([
      {
        description: "Edging",
        details: "40 linear ft",
        price: 200,
      },
    ]);
  });
});
