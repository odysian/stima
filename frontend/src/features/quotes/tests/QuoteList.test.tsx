import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { invoiceService } from "@/features/invoices/services/invoiceService";
import type { InvoiceListItem } from "@/features/invoices/types/invoice.types";
import { QuoteList } from "@/features/quotes/components/QuoteList";
import { LOCAL_STORAGE_RESET_MESSAGE } from "@/features/quotes/offline/captureDb";
import { dispatchLocalRecoveryChanged } from "@/features/quotes/offline/localRecoveryEvents";
import { useRecoverableCaptures } from "@/features/quotes/offline/useRecoverableCaptures";
import { runOutboxPass } from "@/features/quotes/offline/outboxEngine";
import { getJobForSession, updateJobStatus } from "@/features/quotes/offline/outboxRepository";
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
    extract: vi.fn(),
    createManualDraft: vi.fn(),
    convertNotes: vi.fn(),
    createQuote: vi.fn(),
    listQuotes: vi.fn(),
    listReuseCandidates: vi.fn(),
    duplicateQuote: vi.fn(),
    getQuote: vi.fn(),
    updateQuote: vi.fn(),
    updateExtractionReviewMetadata: vi.fn(),
    deleteQuote: vi.fn(),
    generatePdf: vi.fn(),
    shareQuote: vi.fn(),
    revokeShare: vi.fn(),
    sendQuoteEmail: vi.fn(),
    markQuoteWon: vi.fn(),
    markQuoteLost: vi.fn(),
    convertToInvoice: vi.fn(),
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

vi.mock("@/features/quotes/offline/useRecoverableCaptures", () => ({
  useRecoverableCaptures: vi.fn(),
}));

vi.mock("@/features/quotes/offline/outboxRepository", () => ({
  getJobForSession: vi.fn(async () => null),
  updateJobStatus: vi.fn(async () => undefined),
}));

vi.mock("@/features/quotes/offline/outboxEngine", () => ({
  runOutboxPass: vi.fn(async () => undefined),
}));

const mockedQuoteService = vi.mocked(quoteService);
const mockedInvoiceService = vi.mocked(invoiceService);
const mockedUseAuth = vi.mocked(useAuth);
const mockedUseRecoverableCaptures = vi.mocked(useRecoverableCaptures);
const mockedGetJobForSession = vi.mocked(getJobForSession);
const mockedUpdateJobStatus = vi.mocked(updateJobStatus);
const mockedRunOutboxPass = vi.mocked(runOutboxPass);
const ORIGINAL_NAVIGATOR_ONLINE_DESCRIPTOR = Object.getOwnPropertyDescriptor(window.navigator, "onLine");

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

function mockProfile(timezone: string | null = "UTC", authMode: "verified" | "offline_recovered" = "verified"): void {
  mockedUseAuth.mockReturnValue({
    authMode,
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

function setNavigatorOnline(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

function restoreNavigatorOnline(): void {
  if (ORIGINAL_NAVIGATOR_ONLINE_DESCRIPTOR) {
    Object.defineProperty(window.navigator, "onLine", ORIGINAL_NAVIGATOR_ONLINE_DESCRIPTOR);
    return;
  }
  delete (window.navigator as { onLine?: boolean }).onLine;
}

async function openSearch(label: "Search quotes" | "Search invoices" = "Search quotes"): Promise<HTMLInputElement> {
  fireEvent.click(screen.getByRole("button", { name: "Open search" }));
  return await screen.findByLabelText(label) as HTMLInputElement;
}

beforeEach(() => {
  mockProfile();
  mockedUseRecoverableCaptures.mockReturnValue({
    captures: [],
    isLoading: false,
    error: null,
    refresh: vi.fn(async () => undefined),
    deleteCapture: vi.fn(async () => undefined),
  });
});

afterEach(() => {
  vi.clearAllMocks();
  restoreNavigatorOnline();
});

describe("QuoteList", () => {
  it("hides search input by default and shows the open-search button", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();
    await screen.findByText(/Q-001/);

    expect(screen.queryByLabelText("Search quotes")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open search" })).toBeInTheDocument();
  });

  it("opens search, focuses the input, and keeps the search toggle visible as active", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();
    await screen.findByText(/Q-001/);

    const searchInput = await openSearch();
    await waitFor(() => {
      expect(searchInput).toHaveFocus();
    });
    expect(screen.queryByRole("button", { name: "Open search" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close search" })).toHaveClass("bg-primary", "text-on-primary");
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

  it("clears the query from input-end control and keeps search open", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();
    await screen.findByText(/Q-001/);

    const searchInput = await openSearch();
    fireEvent.change(searchInput, { target: { value: "alice" } });
    expect(searchInput).toHaveValue("alice");

    fireEvent.click(screen.getByRole("button", { name: "Clear search text" }));

    expect(screen.getByLabelText("Search quotes")).toBeInTheDocument();
    expect(screen.getByLabelText("Search quotes")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Close search" })).toBeInTheDocument();
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

  it("enters selection mode from overflow menu and renders row checkboxes", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem({ status: "ready" })]);

    renderScreen();
    await screen.findByText(/Q-001/);

    fireEvent.click(screen.getByRole("button", { name: "List actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Select" }));

    const rowCheckbox = screen.getByRole("checkbox", { name: "Select Alice Johnson" });
    expect(rowCheckbox).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /alice johnson/i }));
    expect(rowCheckbox).toHaveAttribute("aria-checked", "true");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("locks tab switch, preserves search, and clears selection via cancel", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([
      makeQuoteListItem({ id: "quote-1", customer_name: "Alice Johnson", status: "ready" }),
      makeQuoteListItem({
        id: "quote-2",
        customer_id: "cust-2",
        customer_name: "Bob Brown",
        doc_number: "Q-002",
        status: "ready",
      }),
    ]);

    renderScreen();
    await screen.findByText(/Q-001/);

    const searchInput = await openSearch();
    fireEvent.change(searchInput, { target: { value: "alice" } });
    expect(searchInput).toHaveValue("alice");

    fireEvent.click(screen.getByRole("button", { name: "List actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Select" }));

    expect(screen.getByLabelText("Search quotes")).toHaveValue("alice");
    const documentTypeFilter = screen.getByLabelText("Document type filter");
    expect(within(documentTypeFilter).getByRole("button", { name: "Quotes" })).toBeDisabled();
    expect(within(documentTypeFilter).getByRole("button", { name: "Invoices" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "New quote" })).not.toBeInTheDocument();
    expect(screen.getByText("0 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /alice johnson/i }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("menuitem", { name: "Delete permanently..." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Cancel selection" }));

    expect(screen.queryByText("0 selected")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New quote" })).toBeInTheDocument();
    expect(within(documentTypeFilter).getByRole("button", { name: "Invoices" })).not.toBeDisabled();
    expect(screen.queryByRole("checkbox", { name: "Select Alice Johnson" })).not.toBeInTheDocument();
  });

  it("archives selected quotes via bulk endpoint and clears selection after confirmation", async () => {
    mockedQuoteService.listQuotes
      .mockResolvedValueOnce([
        makeQuoteListItem({ id: "quote-1", customer_name: "Alice Johnson", status: "ready" }),
      ])
      .mockResolvedValueOnce([
        makeQuoteListItem({ id: "quote-1", customer_name: "Alice Johnson", status: "ready" }),
      ]);
    mockedQuoteService.bulkAction.mockResolvedValueOnce({
      action: "archive",
      applied: [{ id: "quote-1" }],
      blocked: [],
    });

    renderScreen();
    await screen.findByText(/Q-001/);

    fireEvent.click(screen.getByRole("button", { name: "List actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Select" }));
    fireEvent.click(screen.getByRole("button", { name: /alice johnson/i }));

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    const archiveDialog = screen.getByRole("dialog", { name: /archive 1 selected document\?/i });
    fireEvent.click(within(archiveDialog).getByRole("button", { name: "Archive" }));

    await waitFor(() => {
      expect(mockedQuoteService.bulkAction).toHaveBeenCalledWith({
        action: "archive",
        ids: ["quote-1"],
      });
    });
    expect(mockedInvoiceService.bulkAction).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(mockedQuoteService.listQuotes).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("1 document archived.")).toBeInTheDocument();
    expect(screen.queryByText("1 selected")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New quote" })).toBeInTheDocument();
  });

  it("routes invoice delete to invoice bulk endpoint and shows blocked feedback", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem({ status: "ready" })]);
    mockedInvoiceService.listInvoices
      .mockResolvedValueOnce([
        makeInvoiceListItem({
          id: "invoice-1",
          doc_number: "I-001",
          customer_name: "Alice Johnson",
          status: "sent",
        }),
      ])
      .mockResolvedValueOnce([
        makeInvoiceListItem({
          id: "invoice-1",
          doc_number: "I-001",
          customer_name: "Alice Johnson",
          status: "sent",
        }),
      ]);
    mockedInvoiceService.bulkAction.mockResolvedValueOnce({
      action: "delete",
      applied: [],
      blocked: [
        {
          id: "invoice-1",
          reason: "invoice_delete_not_supported",
          message: "Invoices cannot be deleted in this version.",
        },
      ],
    });

    renderScreen();
    await screen.findByText(/Q-001/);
    fireEvent.click(screen.getByRole("button", { name: "Invoices" }));
    await screen.findByText(/I-001/);

    fireEvent.click(screen.getByRole("button", { name: "List actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Select" }));
    fireEvent.click(screen.getByRole("button", { name: /alice johnson/i }));
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete permanently..." }));

    const deleteDialog = screen.getByRole("dialog", { name: /delete 1 selected document permanently\?/i });
    fireEvent.click(within(deleteDialog).getByRole("button", { name: "Delete permanently" }));

    await waitFor(() => {
      expect(mockedInvoiceService.bulkAction).toHaveBeenCalledWith({
        action: "delete",
        ids: ["invoice-1"],
      });
    });
    expect(mockedQuoteService.bulkAction).toHaveBeenCalledTimes(0);
    expect(await screen.findByText("No documents deleted")).toBeInTheDocument();
    expect(screen.getByText("Invoices cannot be deleted in this version.")).toBeInTheDocument();
    expect(screen.queryByText("1 selected")).not.toBeInTheDocument();
  });

  it("uses token-backed emphasis for the active filter and create button", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();

    const filter = await screen.findByLabelText("Document type filter");
    const quotesButton = within(filter).getByRole("button", { name: "Quotes" });
    const createButton = screen.getByRole("button", { name: "New quote" });

    expect(quotesButton).toHaveClass("ghost-shadow", "bg-surface-container-lowest", "text-primary");
    expect(createButton).toHaveClass("forest-gradient", "ghost-shadow", "text-on-primary");
  });

  it("shows an offline-mode banner for offline_recovered auth", async () => {
    mockProfile("UTC", "offline_recovered");
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();

    expect(await screen.findByText("Offline mode")).toBeInTheDocument();
    expect(screen.getByText(/showing locally saved pending captures/i)).toBeInTheDocument();
  });

  it("refetches quotes when auth recovers from offline_recovered to verified while online", async () => {
    setNavigatorOnline(true);
    let authMode: "verified" | "offline_recovered" = "offline_recovered";
    mockedUseAuth.mockImplementation(() => ({
      authMode,
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
    }));

    mockedQuoteService.listQuotes
      .mockResolvedValueOnce([makeQuoteListItem()])
      .mockResolvedValueOnce([
        makeQuoteListItem({
          id: "quote-2",
          doc_number: "Q-002",
          customer_id: "cust-2",
          customer_name: "Bob Brown",
        }),
      ]);

    const { rerender } = render(
      <MemoryRouter>
        <QuoteList />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Offline mode")).toBeInTheDocument();
    expect(mockedQuoteService.listQuotes).toHaveBeenCalledTimes(1);

    authMode = "verified";
    rerender(
      <MemoryRouter>
        <QuoteList />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockedQuoteService.listQuotes).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText(/Q-002/)).toBeInTheDocument();
  });

  it("refreshes quotes and pending captures once on rapid reconnect flaps", async () => {
    setNavigatorOnline(true);
    const refreshRecoverableCaptures = vi.fn(async () => undefined);
    mockedUseRecoverableCaptures.mockReturnValue({
      captures: [],
      isLoading: false,
      error: null,
      refresh: refreshRecoverableCaptures,
      deleteCapture: vi.fn(async () => undefined),
    });
    mockedQuoteService.listQuotes
      .mockResolvedValueOnce([makeQuoteListItem()])
      .mockResolvedValueOnce([
        makeQuoteListItem({
          id: "quote-2",
          doc_number: "Q-002",
        }),
      ]);

    renderScreen();
    await screen.findByText(/Q-001/);
    expect(mockedQuoteService.listQuotes).toHaveBeenCalledTimes(1);

    act(() => {
      setNavigatorOnline(false);
      window.dispatchEvent(new Event("offline"));
      setNavigatorOnline(true);
      window.dispatchEvent(new Event("online"));

      setNavigatorOnline(false);
      window.dispatchEvent(new Event("offline"));
      setNavigatorOnline(true);
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => {
      expect(mockedQuoteService.listQuotes).toHaveBeenCalledTimes(2);
    });
    expect(refreshRecoverableCaptures).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Q-002/)).toBeInTheDocument();
  });

  it("renders pending captures with resume, extract, and delete actions", async () => {
    const deleteCaptureMock = vi.fn(async () => undefined);
    setNavigatorOnline(true);
    mockedUseRecoverableCaptures.mockReturnValue({
      captures: [
        {
          sessionId: "session-1",
          status: "ready_to_extract",
          notes: "Patio estimate",
          customerId: null,
          customerSnapshot: null,
          clipCount: 2,
          updatedAt: "2026-03-20T00:00:00.000Z",
          lastFailureKind: null,
          lastError: null,
        },
      ],
      isLoading: false,
      error: null,
      refresh: vi.fn(async () => undefined),
      deleteCapture: deleteCaptureMock,
    });
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();
    await screen.findByText(/Q-001/);

    expect(screen.getByRole("region", { name: "Pending captures" })).toBeInTheDocument();
    expect(screen.getByText("Patio estimate")).toBeInTheDocument();
    expect(screen.getByText("2 voice clips")).toBeInTheDocument();
    expect(screen.getByText("Status: Ready to sync when you're online.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /resume pending capture/i }));
    expect(navigateMock).toHaveBeenCalledWith("/quotes/capture?localSession=session-1");

    fireEvent.click(screen.getByRole("button", { name: /extract pending capture/i }));
    expect(navigateMock).toHaveBeenCalledWith("/quotes/capture?localSession=session-1&autoExtract=1");

    fireEvent.click(screen.getByRole("button", { name: /delete pending capture/i }));
    expect(screen.getByText("Delete pending capture?")).toBeInTheDocument();
    expect(screen.getByText(/2 voice clips from this device/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(deleteCaptureMock).toHaveBeenCalledWith("session-1");
    });
  });

  it("keeps pending captures header and count, without empty-state body text, when captures are empty", async () => {
    mockedUseRecoverableCaptures.mockReturnValue({
      captures: [],
      isLoading: false,
      error: null,
      refresh: vi.fn(async () => undefined),
      deleteCapture: vi.fn(async () => undefined),
    });
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();
    await screen.findByText(/Q-001/);

    const pendingCapturesRegion = screen.getByRole("region", { name: "Pending captures" });
    expect(within(pendingCapturesRegion).getByText("PENDING CAPTURES")).toBeInTheDocument();
    expect(within(pendingCapturesRegion).getByText("0")).toBeInTheDocument();
    expect(within(pendingCapturesRegion).queryByText("No pending captures yet.")).not.toBeInTheDocument();
    expect(within(pendingCapturesRegion).queryByText("Loading pending captures...")).not.toBeInTheDocument();

    const headerContainer = pendingCapturesRegion.querySelector("div > div");
    expect(headerContainer).not.toBeNull();
    expect(headerContainer).not.toHaveClass("mb-3");
  });

  it("sanitizes IndexedDB errors from pending-capture delete actions", async () => {
    const deleteCaptureMock = vi.fn(async () => {
      throw new Error("Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing.");
    });
    mockedUseRecoverableCaptures.mockReturnValue({
      captures: [
        {
          sessionId: "session-1",
          status: "ready_to_extract",
          notes: "Patio estimate",
          customerId: null,
          customerSnapshot: null,
          clipCount: 1,
          updatedAt: "2026-03-20T00:00:00.000Z",
          lastFailureKind: null,
          lastError: null,
        },
      ],
      isLoading: false,
      error: null,
      refresh: vi.fn(async () => undefined),
      deleteCapture: deleteCaptureMock,
    });
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();
    await screen.findByText(/Q-001/);

    fireEvent.click(screen.getByRole("button", { name: /delete pending capture/i }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText(LOCAL_STORAGE_RESET_MESSAGE)).toBeInTheDocument();
  });

  it("disables pending-capture extract action while offline", async () => {
    setNavigatorOnline(false);
    mockedUseRecoverableCaptures.mockReturnValue({
      captures: [
        {
          sessionId: "session-1",
          status: "ready_to_extract",
          notes: "Patio estimate",
          customerId: null,
          customerSnapshot: null,
          clipCount: 1,
          updatedAt: "2026-03-20T00:00:00.000Z",
          lastFailureKind: null,
          lastError: null,
        },
      ],
      isLoading: false,
      error: null,
      refresh: vi.fn(async () => undefined),
      deleteCapture: vi.fn(async () => undefined),
    });
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();
    await screen.findByText(/Q-001/);

    expect(screen.getByRole("button", { name: /extract pending capture/i })).toBeDisabled();
    expect(screen.getByText("Connect to the internet to use Extract or Retry.")).toBeInTheDocument();
  });

  it("shows Retry action for failed retryable outbox jobs and runs sync pass", async () => {
    const refreshRecoverableCaptures = vi.fn(async () => undefined);
    setNavigatorOnline(true);
    mockedGetJobForSession.mockResolvedValueOnce({
      jobId: "job-1",
      userId: "user-1",
      sessionId: "session-1",
      idempotencyKey: "idem-1",
      status: "failed_retryable",
      attemptCount: 2,
      maxAttempts: 5,
      nextRetryAt: new Date().toISOString(),
      lastFailureKind: "timeout",
      lastError: "Request timed out",
      serverQuoteId: null,
      serverJobId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    mockedUseRecoverableCaptures.mockReturnValue({
      captures: [
        {
          sessionId: "session-1",
          status: "extract_failed",
          notes: "Patio estimate",
          customerId: null,
          customerSnapshot: null,
          clipCount: 0,
          updatedAt: "2026-03-20T00:00:00.000Z",
          lastFailureKind: "timeout",
          lastError: "Request timed out",
          outboxStatus: "failed_retryable",
          outboxAttemptCount: 2,
          outboxMaxAttempts: 5,
        },
      ],
      isLoading: false,
      error: null,
      refresh: refreshRecoverableCaptures,
      deleteCapture: vi.fn(async () => undefined),
    });
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();
    await screen.findByText(/Q-001/);

    fireEvent.click(screen.getByRole("button", { name: /retry pending capture/i }));

    await waitFor(() => {
      expect(mockedUpdateJobStatus).toHaveBeenCalledWith("job-1", expect.objectContaining({
        status: "queued",
      }));
      expect(mockedRunOutboxPass).toHaveBeenCalledWith("user-1");
      expect(refreshRecoverableCaptures).toHaveBeenCalled();
    });
  });

  it("refetches server quotes when an outbox sync succeeds", async () => {
    mockedQuoteService.listQuotes
      .mockResolvedValueOnce([makeQuoteListItem()])
      .mockResolvedValueOnce([
        makeQuoteListItem(),
        makeQuoteListItem({
          id: "quote-2",
          doc_number: "Q-002",
          customer_id: "cust-2",
          customer_name: "Bob Brown",
        }),
      ]);

    renderScreen();
    await screen.findByText(/Q-001/);

    dispatchLocalRecoveryChanged({
      userId: "user-1",
      sessionId: "session-1",
      reason: "outbox_succeeded",
    });

    expect(await screen.findByText(/Q-002/)).toBeInTheDocument();
    expect(mockedQuoteService.listQuotes).toHaveBeenCalledTimes(2);
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
      "bg-surface-container-low",
      "ghost-shadow",
    );

    fireEvent.click(within(draftsSection).getByRole("button", { name: /unassigned/i }));
    expect(navigateMock).toHaveBeenCalledWith("/documents/quote-draft-unassigned/edit", {
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

  it("opens create entry sheet and starts a new quote from the create action", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);

    renderScreen();
    await screen.findByText(/Q-001/);

    fireEvent.click(screen.getByRole("button", { name: "New quote" }));
    fireEvent.click(await screen.findByRole("button", { name: "Create new" }));

    expect(navigateMock).toHaveBeenCalledWith("/quotes/capture");
  });

  it("duplicates a selected quote from chooser and navigates to document edit", async () => {
    mockedQuoteService.listQuotes.mockResolvedValueOnce([makeQuoteListItem()]);
    mockedQuoteService.listReuseCandidates.mockResolvedValueOnce([
      {
        id: "quote-source-1",
        title: "Spring Cleanup",
        doc_number: "Q-099",
        customer_id: "cust-1",
        customer_name: "Alice Johnson",
        total_amount: 320,
        created_at: "2026-03-25T00:00:00.000Z",
        status: "ready",
        line_item_previews: [
          { description: "Mulch", price: 120 },
          { description: "Edge trim", price: 200 },
        ],
        line_item_count: 2,
        more_line_item_count: 0,
      },
    ]);
    mockedQuoteService.duplicateQuote.mockResolvedValueOnce({
      id: "quote-duplicated-1",
      customer_id: "cust-1",
      doc_type: "quote",
      doc_number: "Q-100",
      title: "Spring Cleanup",
      status: "draft",
      source_type: "text",
      transcript: "",
      total_amount: 320,
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

    renderScreen();
    await screen.findByText(/Q-001/);

    fireEvent.click(screen.getByRole("button", { name: "New quote" }));
    fireEvent.click(await screen.findByRole("button", { name: "Create from existing" }));
    fireEvent.click(await screen.findByRole("button", { name: /spring cleanup/i }));

    await waitFor(() => {
      expect(mockedQuoteService.duplicateQuote).toHaveBeenCalledWith("quote-source-1");
    });
    expect(navigateMock).toHaveBeenCalledWith("/documents/quote-duplicated-1/edit");
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
    expect(screen.getByRole("status", { name: /loading quotes/i })).toBeInTheDocument();

    resolveQuotes?.([makeQuoteListItem()]);
    await waitFor(() => {
      expect(screen.queryByRole("status", { name: /loading quotes/i })).not.toBeInTheDocument();
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

  it("skips document fetches while signed out", async () => {
    mockedUseAuth.mockReturnValue({
      authMode: "signed_out",
      isLoading: false,
      isOnboarded: false,
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
      refreshUser: vi.fn(async () => undefined),
      register: vi.fn(async () => undefined),
      user: null,
    });

    renderScreen();

    await waitFor(() => {
      expect(screen.queryByRole("status", { name: /loading quotes/i })).not.toBeInTheDocument();
    });
    expect(mockedQuoteService.listQuotes).not.toHaveBeenCalled();
    expect(mockedInvoiceService.listInvoices).not.toHaveBeenCalled();
  });
});
