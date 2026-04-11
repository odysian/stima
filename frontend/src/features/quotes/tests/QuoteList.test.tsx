import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { invoiceService } from "@/features/invoices/services/invoiceService";
import type { InvoiceListItem } from "@/features/invoices/types/invoice.types";
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
    appendExtraction: vi.fn(),
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

vi.mock("@/features/invoices/services/invoiceService", () => ({
  invoiceService: {
    listInvoices: vi.fn(),
  },
}));

vi.mock("@/features/auth/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

const mockedQuoteService = vi.mocked(quoteService);
const mockedInvoiceService = vi.mocked(invoiceService);
const mockedUseAuth = vi.mocked(useAuth);

function makeQuoteListItem(overrides: Partial<QuoteListItem> = {}): QuoteListItem {
  return {
    id: "quote-1",
    customer_id: "cust-1",
    customer_name: "Alice Johnson",
    doc_number: "Q-001",
    title: null,
    status: "draft",
    total_amount: 120,
    item_count: 1,
    created_at: "2026-03-20T00:00:00.000Z",
    ...overrides,
  };
}

function makeInvoiceListItem(overrides: Partial<InvoiceListItem> = {}): InvoiceListItem {
  return {
    id: "invoice-1",
    customer_id: "cust-1",
    customer_name: "Alice Johnson",
    doc_number: "I-001",
    title: null,
    status: "draft",
    total_amount: 120,
    due_date: "2026-04-19",
    created_at: "2026-03-20T00:00:00.000Z",
    source_document_id: null,
    ...overrides,
  };
}

function mockProfile(timezone: string | null = "UTC"): void {
  mockedUseAuth.mockReturnValue({
    isLoading: false,
    isOnboarded: true,
    login: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    refreshUser: vi.fn(async () => undefined),
    register: vi.fn(async () => undefined),
    user: {
      id: "user-1",
      email: "test@example.com",
      is_active: true,
      is_onboarded: true,
      timezone,
    },
  });
}

function renderScreen(): void {
  render(
    <MemoryRouter>
      <QuoteList />
    </MemoryRouter>,
  );
}

async function openSearch(label: "Search quotes" | "Search invoices" = "Search quotes"): Promise<HTMLInputElement> {
  fireEvent.click(screen.getByRole("button", { name: "Open search" }));
  return await screen.findByLabelText(label) as HTMLInputElement;
}

beforeEach(() => {
  mockProfile();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("QuoteList", () => {
  it("hides search input by default and shows the open-search button", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();
    await screen.findByText(/Q-001/);

    expect(screen.queryByLabelText("Search quotes")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open search" })).toBeInTheDocument();
  });

  it("opens search, focuses the input, and hides the open-search button", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();
    await screen.findByText(/Q-001/);

    const searchInput = await openSearch();
    await waitFor(() => {
      expect(searchInput).toHaveFocus();
    });
    expect(screen.queryByRole("button", { name: "Open search" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close search" })).toBeInTheDocument();
  });

  it("closes search and clears the query, and reopening starts empty", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();
    await screen.findByText(/Q-001/);

    const searchInput = await openSearch();
    fireEvent.change(searchInput, { target: { value: "alice" } });
    expect(searchInput).toHaveValue("alice");

    fireEvent.click(screen.getByRole("button", { name: "Close search" }));
    expect(screen.queryByLabelText("Search quotes")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open search" })).toBeInTheDocument();

    const reopenedSearchInput = await openSearch();
    expect(reopenedSearchInput).toHaveValue("");
  });

  it("preserves open search state and query when switching tabs", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);
    mockedInvoiceService.listInvoices.mockResolvedValueOnce([
      makeInvoiceListItem(),
      makeInvoiceListItem({
        id: "invoice-2",
        customer_id: "cust-2",
        customer_name: "Bob Brown",
        doc_number: "I-002",
      }),
    ]);

    renderScreen();
    await screen.findByText(/Q-001/);

    const quoteSearchInput = await openSearch();
    fireEvent.change(quoteSearchInput, { target: { value: "bob" } });
    expect(quoteSearchInput).toHaveValue("bob");

    fireEvent.click(screen.getByRole("button", { name: "Invoices" }));

    const invoiceSearchInput = await screen.findByLabelText("Search invoices");
    expect(invoiceSearchInput).toHaveValue("bob");
    expect(screen.queryByRole("button", { name: "Open search" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close search" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /bob brown/i })).toBeInTheDocument();
  });

  it("uses token-backed emphasis for the active filter and create button", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();

    const quotesButton = await screen.findByRole("button", { name: "Quotes" });
    const createButton = screen.getByRole("button", { name: "New quote" });

    expect(quotesButton).toHaveClass("ghost-shadow", "bg-surface-container-lowest", "text-primary");
    expect(createButton).toHaveClass("forest-gradient", "ghost-shadow", "text-on-primary");
  });

  it("renders quote cards from listQuotes response", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([
      makeQuoteListItem(),
      makeQuoteListItem({
        id: "quote-2",
        customer_id: "cust-2",
        customer_name: "Bob Brown",
        doc_number: "Q-002",
        title: "Spring Cleanup",
        status: "ready",
        item_count: 3,
      }),
    ]);

    renderScreen();

    expect(await screen.findByRole("heading", { name: "Quotes" })).toBeInTheDocument();
    expect(screen.getByText("Stima")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    expect(screen.queryByText("Sorted by: Most Recent")).not.toBeInTheDocument();
    expect(await screen.findByText(/Q-001/)).toBeInTheDocument();
    expect(screen.getByText("1 active · 1 pending")).toBeInTheDocument();
    expect(screen.getByText("Spring Cleanup")).toBeInTheDocument();
    expect(screen.getByText("Bob Brown")).toBeInTheDocument();
    expect(screen.getByText(/Q-002\s*·\s*Mar 20, 2026/)).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getAllByText("$120.00")).toHaveLength(2);
  });

  it("renders drafts above past quotes and splits draft vs non-draft routing", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([
      makeQuoteListItem({
        id: "quote-draft-unassigned",
        customer_id: null,
        customer_name: null,
        doc_number: "Q-001",
        status: "draft",
        requires_customer_assignment: true,
      }),
      makeQuoteListItem({
        id: "quote-draft-assigned",
        customer_id: "cust-2",
        customer_name: "Bob Brown",
        doc_number: "Q-002",
        status: "draft",
        requires_customer_assignment: false,
      }),
      makeQuoteListItem({
        id: "quote-ready",
        customer_id: "cust-3",
        customer_name: "Carla Crew",
        doc_number: "Q-003",
        status: "ready",
      }),
      makeQuoteListItem({
        id: "quote-shared",
        customer_id: "cust-4",
        customer_name: "Diego Deck",
        doc_number: "Q-004",
        status: "shared",
      }),
      makeQuoteListItem({
        id: "quote-approved",
        customer_id: "cust-5",
        customer_name: "Elliot Elm",
        doc_number: "Q-005",
        status: "approved",
      }),
    ]);

    renderScreen();

    const draftsSection = await screen.findByRole("region", { name: "DRAFTS" });
    const pastQuotesSection = screen.getByRole("region", { name: "PAST QUOTES" });

    const orderFlag = draftsSection.compareDocumentPosition(pastQuotesSection);
    expect(orderFlag & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);

    expect(within(draftsSection).getByRole("button", { name: /unassigned/i })).toBeInTheDocument();
    expect(within(draftsSection).getByRole("button", { name: /bob brown/i })).toBeInTheDocument();
    expect(within(draftsSection).queryByRole("button", { name: /carla crew/i })).not.toBeInTheDocument();
    expect(within(pastQuotesSection).getByRole("button", { name: /carla crew/i })).toBeInTheDocument();
    expect(within(pastQuotesSection).getByRole("button", { name: /diego deck/i })).toBeInTheDocument();
    expect(within(pastQuotesSection).getByRole("button", { name: /elliot elm/i })).toBeInTheDocument();

    const needsCustomerBadges = within(draftsSection).getAllByText("Needs customer");
    expect(needsCustomerBadges).toHaveLength(1);

    const unassignedDraftRow = within(draftsSection).getByRole("button", { name: /unassigned/i });
    expect(unassignedDraftRow).toHaveClass(
      "border-l-4",
      "border-warning-accent",
      "glass-surface",
      "backdrop-blur-md",
      "ghost-shadow",
    );

    fireEvent.click(within(draftsSection).getByRole("button", { name: /unassigned/i }));
    expect(navigateMock).toHaveBeenCalledWith("/quotes/quote-draft-unassigned/review", {
      state: { origin: "list" },
    });

    fireEvent.click(within(pastQuotesSection).getByRole("button", { name: /carla crew/i }));
    expect(navigateMock).toHaveBeenCalledWith("/quotes/quote-ready/preview");
  });

  it("renders empty state when no quotes are returned", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([]);

    renderScreen();

    expect(
      await screen.findByText("No quotes yet. Tap New Quote to create your first."),
    ).toBeInTheDocument();
  });

  it("switches to invoices mode and renders invoice cards", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);
    mockedInvoiceService.listInvoices.mockResolvedValueOnce([
      makeInvoiceListItem(),
      makeInvoiceListItem({
        id: "invoice-2",
        customer_id: "cust-2",
        customer_name: "Bob Brown",
        doc_number: "I-002",
        title: "Front Bed Refresh",
        status: "ready",
        total_amount: 220,
        created_at: "2026-03-21T00:00:00.000Z",
        source_document_id: "quote-2",
      }),
      makeInvoiceListItem({
        id: "invoice-3",
        customer_id: "cust-3",
        customer_name: "Carla Crew",
        doc_number: "I-003",
        status: "paid",
        total_amount: 340,
      }),
      makeInvoiceListItem({
        id: "invoice-4",
        customer_id: "cust-4",
        customer_name: "Diego Deck",
        doc_number: "I-004",
        status: "void",
        total_amount: 95,
      }),
    ]);

    renderScreen();
    await screen.findByText(/Q-001/);

    fireEvent.click(screen.getByRole("button", { name: "Invoices" }));

    expect(await screen.findByRole("heading", { name: "Invoices" })).toBeInTheDocument();
    expect(screen.getByText("1 active · 1 pending")).toBeInTheDocument();
    expect(screen.getByText("Front Bed Refresh")).toBeInTheDocument();
    expect(screen.getByText("Bob Brown")).toBeInTheDocument();
    expect(screen.getByText(/I-002\s*·\s*Mar 21, 2026/)).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
    expect(screen.getByText("Void")).toBeInTheDocument();
    expect(screen.getAllByText("$220.00")).toHaveLength(1);
    expect(screen.getByRole("region", { name: "PAST INVOICES" }).querySelector("p:empty")).toBeNull();
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
    await screen.findByText(/Q-001/);

    fireEvent.change(await openSearch(), {
      target: { value: "bob" },
    });

    expect(screen.queryByText("Alice Johnson")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /bob brown/i })).toBeInTheDocument();
    expect(screen.getByText(/Q-002\s*·\s*Mar 20, 2026/)).toBeInTheDocument();
  });

  it("filters rows by quote title", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([
      makeQuoteListItem(),
      makeQuoteListItem({
        id: "quote-2",
        customer_id: "cust-2",
        customer_name: "Bob Brown",
        doc_number: "Q-002",
        title: "Spring Cleanup",
        status: "ready",
      }),
    ]);

    renderScreen();
    await screen.findByText(/Q-001/);

    fireEvent.change(await openSearch(), {
      target: { value: "spring" },
    });

    expect(screen.queryByText(/Q-001/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /spring cleanup/i })).toBeInTheDocument();
  });

  it("shows search empty state when filter has no matches", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();
    await screen.findByText(/Q-001/);

    fireEvent.change(await openSearch(), {
      target: { value: "does-not-exist" },
    });

    expect(screen.getByText("No quotes match your search.")).toBeInTheDocument();
  });

  it("navigates to quote preview when a non-draft row is clicked", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem({ status: "ready" })]);

    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: /q-001/i }));

    expect(navigateMock).toHaveBeenCalledWith("/quotes/quote-1/preview");
  });

  it("navigates to invoice detail when an invoice row is clicked", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);
    mockedInvoiceService.listInvoices.mockResolvedValueOnce([makeInvoiceListItem()]);

    renderScreen();
    await screen.findByText(/Q-001/);

    fireEvent.click(screen.getByRole("button", { name: "Invoices" }));
    fireEvent.click(await screen.findByRole("button", { name: /i-001/i }));

    expect(navigateMock).toHaveBeenCalledWith("/invoices/invoice-1");
  });

  it("renders compact stats text for active and pending quotes", async () => {
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
    await screen.findByText(/Q-001/);

    expect(screen.getByText(/1 active\s*·\s*1 pending/i)).toBeInTheDocument();
    expect(screen.queryByText("ACTIVE QUOTES")).not.toBeInTheDocument();
    expect(screen.queryByText("PENDING REVIEW")).not.toBeInTheDocument();
  });

  it("renders BottomNav with quotes tab active", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();
    await screen.findByText(/Q-001/);

    expect(within(screen.getByRole("navigation")).getByRole("button", { name: /quotes/i })).toHaveClass("text-primary");
  });

  it("navigates to new quote when FAB is clicked", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();
    await screen.findByText(/Q-001/);

    fireEvent.click(screen.getByRole("button", { name: "New quote" }));

    expect(navigateMock).toHaveBeenCalledWith("/quotes/capture");
  });

  it("renders invoice empty state when no invoices are returned", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);
    mockedInvoiceService.listInvoices.mockResolvedValueOnce([]);

    renderScreen();
    await screen.findByText(/Q-001/);

    fireEvent.click(screen.getByRole("button", { name: "Invoices" }));

    expect(
      await screen.findByText("No invoices yet. Convert a quote to an invoice from Preview."),
    ).toBeInTheDocument();
  });

  it("hides the Drafts section when there are only non-draft quotes", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([
      makeQuoteListItem({ status: "ready" }),
      makeQuoteListItem({
        id: "quote-2",
        customer_id: "cust-2",
        customer_name: "Bob Brown",
        doc_number: "Q-002",
        status: "shared",
      }),
    ]);

    renderScreen();

    await screen.findByText(/Q-001/);

    expect(screen.queryByRole("region", { name: "DRAFTS" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "PAST QUOTES" })).toBeInTheDocument();
  });

  it("shows loading state while list request is in flight", async () => {
    let resolveQuotes: ((quotes: QuoteListItem[]) => void) | undefined;
    const pendingRequest = new Promise<QuoteListItem[]>((resolve) => {
      resolveQuotes = resolve;
    });
    mockedQuoteService.listQuotes.mockReturnValueOnce(pendingRequest);

    renderScreen();

    expect(screen.queryByText(/active\s*·\s*\d+\s*pending/i)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading quotes...");

    resolveQuotes?.([makeQuoteListItem()]);
    await waitFor(() => {
      expect(screen.queryByText("Loading quotes...")).not.toBeInTheDocument();
    });
    expect(screen.getByText("0 active · 1 pending")).toBeInTheDocument();
  });

  it("renders created_at using the saved business timezone", async () => {
    mockProfile("America/New_York");
    mockedQuoteService.listQuotes.mockResolvedValueOnce([
      makeQuoteListItem({
        id: "quote-utc-midnight",
        created_at: "2026-03-25T00:00:00.000Z",
      }),
    ]);

    renderScreen();

    expect(await screen.findByRole("button", { name: /alice johnson/i })).toBeInTheDocument();
    expect(screen.getByText(/Q-001\s*·\s*Mar 24, 2026/)).toBeInTheDocument();
  });

  it("renders an em dash when total_amount is null", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([
      makeQuoteListItem({
        id: "quote-null-total",
        total_amount: null,
      }),
    ]);

    renderScreen();

    expect(await screen.findByText("—")).toBeInTheDocument();
  });

  it("keeps the search label accessible while visually hiding it", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();
    await screen.findByText(/Q-001/);

    const searchInput = await openSearch();
    const searchLabel = document.querySelector('label[for="document-search"]');

    expect(searchInput).toBeInTheDocument();
    expect(searchLabel).not.toBeNull();
    expect(searchLabel).toHaveClass("sr-only");
  });

  it("shows error state when list request fails", async () => {
    mockedQuoteService.listQuotes.mockRejectedValueOnce(new Error("Unable to load quotes"));

    renderScreen();

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load quotes");
    expect(screen.queryByText(/active\s*·\s*\d+\s*pending/i)).not.toBeInTheDocument();
  });
});
