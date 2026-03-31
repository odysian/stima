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

beforeEach(() => {
  mockProfile();
});

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
        title: "Spring Cleanup",
        status: "ready",
        item_count: 3,
      }),
    ]);

    renderScreen();

    expect(await screen.findByRole("heading", { name: "Quotes" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    expect(screen.queryByText("Sorted by: Most Recent")).not.toBeInTheDocument();
    expect(await screen.findByText("Q-001")).toBeInTheDocument();
    expect(screen.getByText("1 active · 1 pending")).toBeInTheDocument();
    expect(screen.getByText("Spring Cleanup")).toBeInTheDocument();
    expect(screen.getByText(/Bob Brown\s*·\s*Q-002\s*·\s*Mar 20, 2026\s*·\s*3 items/)).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getAllByText("$120.00")).toHaveLength(2);
  });

  it("renders empty state when no quotes are returned", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([]);

    renderScreen();

    expect(
      await screen.findByText("No quotes yet. Tap Create Document to create your first."),
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
    ]);

    renderScreen();
    await screen.findByText("Q-001");

    fireEvent.click(screen.getByRole("button", { name: "Invoices" }));

    expect(await screen.findByRole("heading", { name: "Invoices" })).toBeInTheDocument();
    expect(screen.getByText("1 active · 1 pending")).toBeInTheDocument();
    expect(screen.getByText("Front Bed Refresh")).toBeInTheDocument();
    expect(screen.getByText(/Bob Brown\s*·\s*I-002\s*·\s*Mar 21, 2026/)).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getAllByText("$220.00")).toHaveLength(1);
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
    await screen.findByText("Q-001");

    fireEvent.change(screen.getByLabelText("Search quotes"), {
      target: { value: "bob" },
    });

    expect(screen.queryByText("Alice Johnson")).not.toBeInTheDocument();
    expect(screen.getByText(/Bob Brown\s*·\s*Mar 20, 2026\s*·\s*1 item/)).toBeInTheDocument();
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
      }),
    ]);

    renderScreen();
    await screen.findByText("Q-001");

    fireEvent.change(screen.getByLabelText("Search quotes"), {
      target: { value: "spring" },
    });

    expect(screen.queryByText("Q-001")).not.toBeInTheDocument();
    expect(screen.getByText("Spring Cleanup")).toBeInTheDocument();
  });

  it("shows search empty state when filter has no matches", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();
    await screen.findByText("Q-001");

    fireEvent.change(screen.getByLabelText("Search quotes"), {
      target: { value: "does-not-exist" },
    });

    expect(screen.getByText("No quotes match your search.")).toBeInTheDocument();
  });

  it("navigates to quote preview when a row is clicked", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: /q-001/i }));

    expect(navigateMock).toHaveBeenCalledWith("/quotes/quote-1/preview");
  });

  it("navigates to invoice detail when an invoice row is clicked", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);
    mockedInvoiceService.listInvoices.mockResolvedValueOnce([makeInvoiceListItem()]);

    renderScreen();
    await screen.findByText("Q-001");

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
    await screen.findByText("Q-001");

    expect(screen.getByText(/1 active\s*·\s*1 pending/i)).toBeInTheDocument();
    expect(screen.queryByText("ACTIVE QUOTES")).not.toBeInTheDocument();
    expect(screen.queryByText("PENDING REVIEW")).not.toBeInTheDocument();
  });

  it("renders BottomNav with quotes tab active", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();
    await screen.findByText("Q-001");

    expect(within(screen.getByRole("navigation")).getByRole("button", { name: /quotes/i })).toHaveClass("text-primary");
  });

  it("navigates to new quote when FAB is clicked", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();
    await screen.findByText("Q-001");

    fireEvent.click(screen.getByRole("button", { name: "Create document" }));

    expect(navigateMock).toHaveBeenCalledWith("/quotes/new");
  });

  it("renders invoice empty state when no invoices are returned", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);
    mockedInvoiceService.listInvoices.mockResolvedValueOnce([]);

    renderScreen();
    await screen.findByText("Q-001");

    fireEvent.click(screen.getByRole("button", { name: "Invoices" }));

    expect(
      await screen.findByText("No invoices yet. Tap Create Document to create your first."),
    ).toBeInTheDocument();
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

    expect(await screen.findByText(/Alice Johnson\s*·\s*Mar 24, 2026/)).toBeInTheDocument();
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
    await screen.findByText("Q-001");

    const searchInput = screen.getByLabelText("Search quotes");
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
