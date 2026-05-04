import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuoteReuseChooser } from "@/features/quotes/components/QuoteReuseChooser";
import { quoteService } from "@/features/quotes/services/quoteService";

vi.mock("@/features/quotes/services/quoteService", () => ({
  quoteService: {
    listReuseCandidates: vi.fn(),
    duplicateQuote: vi.fn(),
  },
}));

const mockedQuoteService = vi.mocked(quoteService);

function makeReuseCandidate(id = "quote-1", title = "Backyard Refresh") {
  return {
    id,
    title,
    doc_number: "Q-001",
    customer_id: "cust-1",
    customer_name: "Evergreen Landscaping",
    total_amount: 750,
    created_at: "2026-03-25T00:00:00.000Z",
    status: "shared" as const,
    line_item_previews: [
      { description: "Design plan", price: 120 },
      { description: "Material staging", price: 240 },
      { description: "Install edging", price: 310 },
    ],
    line_item_count: 4,
    more_line_item_count: 1,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("QuoteReuseChooser", () => {
  it("renders reuse candidates with preview rows and overflow count", async () => {
    mockedQuoteService.listReuseCandidates.mockResolvedValueOnce([makeReuseCandidate()]);

    render(
      <QuoteReuseChooser
        open
        timezone="UTC"
        onClose={vi.fn()}
        onQuoteDuplicated={vi.fn()}
      />,
    );

    expect(await screen.findByRole("button", { name: /backyard refresh/i })).toBeInTheDocument();
    expect(screen.getByText("Evergreen Landscaping")).toBeInTheDocument();
    expect(screen.getByText(/Q-001\s*·\s*Mar 25, 2026/)).toBeInTheDocument();
    expect(screen.getByText("Design plan")).toBeInTheDocument();
    expect(screen.getByText("+1 more items")).toBeInTheDocument();
    expect(mockedQuoteService.listReuseCandidates).toHaveBeenCalledWith({
      customer_id: undefined,
      q: undefined,
    });
  });

  it("passes customer scope and search query to reuse-candidates API", async () => {
    vi.useFakeTimers();
    mockedQuoteService.listReuseCandidates.mockResolvedValue([]);

    render(
      <QuoteReuseChooser
        open
        customerId="cust-1"
        timezone="UTC"
        onClose={vi.fn()}
        onQuoteDuplicated={vi.fn()}
      />,
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(mockedQuoteService.listReuseCandidates).toHaveBeenCalledWith({
      customer_id: "cust-1",
      q: undefined,
    });

    fireEvent.change(screen.getByLabelText("Search existing quotes"), {
      target: { value: "evergreen" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(274);
    });
    expect(mockedQuoteService.listReuseCandidates).not.toHaveBeenCalledWith({
      customer_id: "cust-1",
      q: "evergreen",
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mockedQuoteService.listReuseCandidates).toHaveBeenCalledWith({
      customer_id: "cust-1",
      q: "evergreen",
    });
  });

  it("duplicates the selected quote and reports the new id", async () => {
    const onQuoteDuplicated = vi.fn();
    mockedQuoteService.listReuseCandidates.mockResolvedValueOnce([makeReuseCandidate()]);
    mockedQuoteService.duplicateQuote.mockResolvedValueOnce({
      id: "quote-2",
      customer_id: "cust-1",
      doc_type: "quote",
      doc_number: "Q-002",
      title: "Backyard Refresh",
      status: "draft",
      source_type: "text",
      transcript: "",
      total_amount: 750,
      tax_rate: null,
      discount_type: null,
      discount_value: null,
      deposit_amount: null,
      notes: null,
      shared_at: null,
      share_token: null,
      line_items: [],
      created_at: "2026-03-26T00:00:00.000Z",
      updated_at: "2026-03-26T00:00:00.000Z",
    });

    render(
      <QuoteReuseChooser
        open
        timezone="UTC"
        onClose={vi.fn()}
        onQuoteDuplicated={onQuoteDuplicated}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /backyard refresh/i }));

    await waitFor(() => {
      expect(mockedQuoteService.duplicateQuote).toHaveBeenCalledWith("quote-1");
    });
    expect(onQuoteDuplicated).toHaveBeenCalledWith("quote-2");
  });

  it("keeps only latest search results when slower older response resolves last", async () => {
    vi.useFakeTimers();
    const initial = deferred<ReturnType<typeof makeReuseCandidate>[]>();
    const oldSearch = deferred<ReturnType<typeof makeReuseCandidate>[]>();
    const newSearch = deferred<ReturnType<typeof makeReuseCandidate>[]>();

    mockedQuoteService.listReuseCandidates.mockImplementation((params) => {
      const q = params?.q;
      if (q === "old") {
        return oldSearch.promise;
      }
      if (q === "new") {
        return newSearch.promise;
      }
      return initial.promise;
    });

    render(
      <QuoteReuseChooser
        open
        timezone="UTC"
        onClose={vi.fn()}
        onQuoteDuplicated={vi.fn()}
      />,
    );

    initial.resolve([]);
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(mockedQuoteService.listReuseCandidates).toHaveBeenCalledWith({
      customer_id: undefined,
      q: undefined,
    });

    fireEvent.change(screen.getByLabelText("Search existing quotes"), {
      target: { value: "old" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(275);
    });

    fireEvent.change(screen.getByLabelText("Search existing quotes"), {
      target: { value: "new" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(275);
    });

    await act(async () => {
      newSearch.resolve([makeReuseCandidate("quote-new", "Newest Quote")]);
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: /newest quote/i })).toBeInTheDocument();

    await act(async () => {
      oldSearch.resolve([makeReuseCandidate("quote-old", "Older Quote")]);
      await Promise.resolve();
    });
    expect(screen.queryByRole("button", { name: /older quote/i })).not.toBeInTheDocument();
  });

  it("ignores late responses after the sheet closes", async () => {
    const pending = deferred<ReturnType<typeof makeReuseCandidate>[]>();
    mockedQuoteService.listReuseCandidates.mockReturnValue(pending.promise);

    const { rerender } = render(
      <QuoteReuseChooser
        open
        timezone="UTC"
        onClose={vi.fn()}
        onQuoteDuplicated={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockedQuoteService.listReuseCandidates).toHaveBeenCalledTimes(1);
    });

    rerender(
      <QuoteReuseChooser
        open={false}
        timezone="UTC"
        onClose={vi.fn()}
        onQuoteDuplicated={vi.fn()}
      />,
    );

    pending.resolve([makeReuseCandidate("quote-late", "Late Quote")]);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /late quote/i })).not.toBeInTheDocument();
    });
  });
});
