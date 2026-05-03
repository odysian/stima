import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { invoiceService } from "@/features/invoices/services/invoiceService";
import type { InvoiceListItem } from "@/features/invoices/types/invoice.types";
import { ArchiveList } from "@/features/quotes/components/ArchiveList";
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
    listQuotes: vi.fn(),
    bulkAction: vi.fn(),
  },
}));

vi.mock("@/features/invoices/services/invoiceService", () => ({
  invoiceService: {
    listInvoices: vi.fn(),
    bulkAction: vi.fn(),
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
    title: "Archived quote",
    status: "ready",
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
    title: "Archived invoice",
    status: "sent",
    total_amount: 120,
    due_date: "2026-04-19",
    created_at: "2026-03-20T00:00:00.000Z",
    source_document_id: null,
    ...overrides,
  };
}

function mockProfile(): void {
  mockedUseAuth.mockReturnValue({
    authMode: "verified",
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
      timezone: "UTC",
    },
  });
}

function renderScreen(): void {
  render(
    <MemoryRouter>
      <ArchiveList />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockProfile();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ArchiveList", () => {
  it("loads archived quotes by default", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();

    expect(await screen.findByRole("heading", { name: "Archived" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /alice johnson/i })).toBeInTheDocument();
    expect(mockedQuoteService.listQuotes).toHaveBeenCalledWith({ archived: true });
    expect(mockedInvoiceService.listInvoices).not.toHaveBeenCalled();
  });

  it("toggles to archived invoices tab and fetches invoices", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);
    mockedInvoiceService.listInvoices.mockResolvedValueOnce([makeInvoiceListItem()]);

    renderScreen();
    await screen.findByRole("button", { name: /alice johnson/i });

    fireEvent.click(screen.getByRole("button", { name: "Invoices" }));

    expect(await screen.findByRole("button", { name: /i-001/i })).toBeInTheDocument();
    expect(mockedInvoiceService.listInvoices).toHaveBeenCalledWith({ archived: true });
  });

  it("unarchives selected archived quotes and clears selection", async () => {
    mockedQuoteService.listQuotes
      .mockResolvedValueOnce([makeQuoteListItem()])
      .mockResolvedValueOnce([]);
    mockedQuoteService.bulkAction.mockResolvedValueOnce({
      action: "unarchive",
      applied: [{ id: "quote-1" }],
      blocked: [],
    });

    renderScreen();
    await screen.findByRole("button", { name: /alice johnson/i });

    fireEvent.click(screen.getByRole("button", { name: "List actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Select" }));
    fireEvent.click(screen.getByRole("button", { name: /alice johnson/i }));

    fireEvent.click(screen.getByRole("button", { name: "Unarchive" }));
    const dialog = screen.getByRole("dialog", { name: /unarchive 1 selected document\?/i });
    fireEvent.click(within(dialog).getByRole("button", { name: "Unarchive" }));

    await waitFor(() => {
      expect(mockedQuoteService.bulkAction).toHaveBeenCalledWith({
        action: "unarchive",
        ids: ["quote-1"],
      });
    });
    await waitFor(() => {
      expect(mockedQuoteService.listQuotes).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("1 document unarchived.")).toBeInTheDocument();
    expect(screen.queryByText("1 selected")).not.toBeInTheDocument();
  });
});
