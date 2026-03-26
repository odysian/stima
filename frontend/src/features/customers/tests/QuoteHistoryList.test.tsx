import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QuoteHistoryList } from "@/features/customers/components/QuoteHistoryList";
import type { QuoteListItem } from "@/features/quotes/types/quote.types";

function makeQuote(overrides: Partial<QuoteListItem> = {}): QuoteListItem {
  return {
    id: "quote-1",
    customer_id: "cust-1",
    customer_name: "Alice Johnson",
    doc_number: "Q-001",
    title: null,
    status: "draft",
    total_amount: 1250,
    item_count: 3,
    created_at: "2026-03-14T00:00:00.000Z",
    ...overrides,
  };
}

describe("QuoteHistoryList", () => {
  it("renders the two-line quote history card layout with singular and plural item counts", () => {
    render(
      <QuoteHistoryList
        quotes={[
          makeQuote({ title: "Front Yard Refresh" }),
          makeQuote({
            id: "quote-2",
            doc_number: "Q-002",
            item_count: 1,
            total_amount: 400,
            status: "ready",
          }),
        ]}
        onQuoteClick={vi.fn()}
        timezone="UTC"
      />,
    );

    expect(screen.getByText("Quote History")).toBeInTheDocument();
    expect(screen.getByText("2 QUOTES")).toBeInTheDocument();
    expect(screen.getByText("Front Yard Refresh")).toBeInTheDocument();
    expect(screen.getByText(/Q-001\s*·\s*Mar 14, 2026\s*·\s*3 items/)).toBeInTheDocument();
    expect(screen.getByText("$1,250.00")).toBeInTheDocument();
    expect(screen.getByText(/Mar 14, 2026\s*·\s*1 item/)).toBeInTheDocument();

    const quoteButton = screen.getByRole("button", { name: /front yard refresh/i });
    expect(quoteButton).toHaveClass("rounded-xl");
    expect(quoteButton).toHaveClass("active:scale-[0.98]");
    expect(quoteButton).toHaveClass("active:bg-surface-container-low");
  });

  it("calls onQuoteClick with the selected quote id", () => {
    const onQuoteClick = vi.fn();

    render(<QuoteHistoryList quotes={[makeQuote()]} onQuoteClick={onQuoteClick} timezone="UTC" />);

    fireEvent.click(screen.getByRole("button", { name: /q-001/i }));

    expect(onQuoteClick).toHaveBeenCalledWith("quote-1");
  });

  it("renders em dash when total_amount is null", () => {
    render(
      <QuoteHistoryList
        quotes={[makeQuote({ total_amount: null })]}
        onQuoteClick={vi.fn()}
        timezone="UTC"
      />,
    );

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders the empty state when no quotes exist", () => {
    render(<QuoteHistoryList quotes={[]} onQuoteClick={vi.fn()} timezone="UTC" />);

    expect(screen.getByText("No quotes yet.")).toBeInTheDocument();
  });

  it("renders dates using the provided timezone", () => {
    render(
      <QuoteHistoryList
        quotes={[makeQuote({ created_at: "2026-03-25T00:00:00.000Z" })]}
        onQuoteClick={vi.fn()}
        timezone="America/New_York"
      />,
    );

    expect(screen.getByText(/Mar 24, 2026\s*·\s*3 items/)).toBeInTheDocument();
  });
});
