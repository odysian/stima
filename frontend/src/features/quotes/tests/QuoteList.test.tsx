import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuoteList } from "@/features/quotes/components/QuoteList";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteListItem } from "@/features/quotes/types/quote.types";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("@/features/quotes/services/quoteService", () => ({
  quoteService: {
    convertNotes: vi.fn(),
    captureAudio: vi.fn(),
    createQuote: vi.fn(),
    listQuotes: vi.fn(),
    getQuote: vi.fn(),
    updateQuote: vi.fn(),
    generatePdf: vi.fn(),
    shareQuote: vi.fn(),
  },
}));

const mockedQuoteService = vi.mocked(quoteService);

function makeQuoteListItem(overrides: Partial<QuoteListItem> = {}): QuoteListItem {
  return {
    id: "quote-1",
    customer_id: "cust-1",
    customer_name: "Alice Johnson",
    doc_number: "Q-001",
    status: "draft",
    total_amount: 120,
    item_count: 1,
    created_at: "2026-03-20T00:00:00.000Z",
    ...overrides,
  };
}

function renderScreen(): void {
  render(
    <MemoryRouter>
      <QuoteList />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("QuoteList", () => {
  it("renders quote cards from listQuotes response", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([
      makeQuoteListItem(),
      makeQuoteListItem({
        id: "quote-2",
        customer_id: "cust-2",
        customer_name: "Bob Brown",
        doc_number: "Q-002",
        status: "ready",
        item_count: 3,
      }),
    ]);

    renderScreen();

    expect(await screen.findByText("Stima Quotes")).toBeInTheDocument();
    expect(await screen.findByText("Alice Johnson")).toBeInTheDocument();
    expect(screen.getByText(/Q-002/)).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("3 items")).toBeInTheDocument();
  });

  it("renders empty state when no quotes are returned", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([]);

    renderScreen();

    expect(
      await screen.findByText("No quotes yet. Tap + to create your first."),
    ).toBeInTheDocument();
  });

  it("filters rows by customer name", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([
      makeQuoteListItem(),
      makeQuoteListItem({
        id: "quote-2",
        customer_id: "cust-2",
        customer_name: "Bob Brown",
        doc_number: "Q-002",
      }),
    ]);

    renderScreen();
    await screen.findByText("Alice Johnson");

    fireEvent.change(screen.getByLabelText("Search quotes"), {
      target: { value: "bob" },
    });

    expect(screen.queryByText("Alice Johnson")).not.toBeInTheDocument();
    expect(screen.getByText("Bob Brown")).toBeInTheDocument();
  });

  it("filters rows by doc number", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([
      makeQuoteListItem(),
      makeQuoteListItem({
        id: "quote-2",
        customer_id: "cust-2",
        customer_name: "Bob Brown",
        doc_number: "Q-002",
      }),
    ]);

    renderScreen();
    await screen.findByText("Alice Johnson");

    fireEvent.change(screen.getByLabelText("Search quotes"), {
      target: { value: "q-002" },
    });

    expect(screen.queryByText("Alice Johnson")).not.toBeInTheDocument();
    expect(screen.getByText("Bob Brown")).toBeInTheDocument();
  });

  it("shows search empty state when filter has no matches", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();
    await screen.findByText("Alice Johnson");

    fireEvent.change(screen.getByLabelText("Search quotes"), {
      target: { value: "does-not-exist" },
    });

    expect(screen.getByText("No quotes match your search.")).toBeInTheDocument();
  });

  it("navigates to quote preview when a row is clicked", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: /alice johnson/i }));

    expect(navigateMock).toHaveBeenCalledWith("/quotes/quote-1/preview");
  });

  it("renders stats bar counts for active and pending quotes", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([
      makeQuoteListItem({ status: "ready" }),
      makeQuoteListItem({
        id: "quote-2",
        customer_id: "cust-2",
        customer_name: "Bob Brown",
        doc_number: "Q-002",
        status: "draft",
      }),
    ]);

    renderScreen();
    await screen.findByText("Alice Johnson");

    const activeTile = screen.getByText("ACTIVE QUOTES").closest("div");
    const pendingTile = screen.getByText("PENDING REVIEW").closest("div");

    expect(activeTile).not.toBeNull();
    expect(pendingTile).not.toBeNull();
    expect(within(activeTile as HTMLDivElement).getByText("1")).toBeInTheDocument();
    expect(within(pendingTile as HTMLDivElement).getByText("1")).toBeInTheDocument();
  });

  it("renders BottomNav with quotes tab active", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();
    await screen.findByText("Alice Johnson");

    expect(screen.getByRole("button", { name: /quotes/i })).toHaveClass("text-primary");
  });

  it("navigates to new quote when FAB is clicked", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();
    await screen.findByText("Alice Johnson");

    fireEvent.click(screen.getByRole("button", { name: "Create quote" }));

    expect(navigateMock).toHaveBeenCalledWith("/quotes/new");
  });

  it("shows loading state while list request is in flight", async () => {
    let resolveQuotes: ((quotes: QuoteListItem[]) => void) | undefined;
    const pendingRequest = new Promise<QuoteListItem[]>((resolve) => {
      resolveQuotes = resolve;
    });
    mockedQuoteService.listQuotes.mockReturnValueOnce(pendingRequest);

    renderScreen();

    expect(screen.getByRole("status")).toHaveTextContent("Loading quotes...");

    resolveQuotes?.([makeQuoteListItem()]);
    await waitFor(() => {
      expect(screen.queryByText("Loading quotes...")).not.toBeInTheDocument();
    });
  });

  it("renders created_at using a timezone-stable calendar day", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([
      makeQuoteListItem({
        id: "quote-utc-midnight",
        created_at: "2026-03-21T00:00:00.000Z",
      }),
    ]);

    renderScreen();

    expect(await screen.findByText(/Q-001\s*·\s*Mar 21, 2026/)).toBeInTheDocument();
  });

  it("shows error state when list request fails", async () => {
    mockedQuoteService.listQuotes.mockRejectedValueOnce(new Error("Unable to load quotes"));

    renderScreen();

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load quotes");
  });
});
