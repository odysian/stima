import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentEditScreen } from "@/features/quotes/components/ReviewScreen";
import { mapInvoiceToEditDraft, mapQuoteToEditDraft, usePersistedReview } from "@/features/quotes/hooks/usePersistedReview";
import { invoiceService } from "@/features/invoices/services/invoiceService";
import type { InvoiceDetail } from "@/features/invoices/types/invoice.types";
import { profileService } from "@/features/profile/services/profileService";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteDetail } from "@/features/quotes/types/quote.types";

const navigateMock = vi.fn();
const useParamsMock = vi.fn(() => ({ id: "doc-1" }));
const useLocationMock = vi.fn<() => { state: unknown }>(() => ({ state: null }));
const useBeforeUnloadMock = vi.fn<(callback: (event: BeforeUnloadEvent) => void) => void>();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => useParamsMock(),
    useLocation: () => useLocationMock(),
    useBeforeUnload: (callback: (event: BeforeUnloadEvent) => void) => useBeforeUnloadMock(callback),
  };
});

vi.mock("@/features/quotes/hooks/usePersistedReview", async () => {
  const actual = await vi.importActual<typeof import("@/features/quotes/hooks/usePersistedReview")>(
    "@/features/quotes/hooks/usePersistedReview",
  );
  return {
    ...actual,
    usePersistedReview: vi.fn(),
  };
});

vi.mock("@/features/quotes/services/quoteService", () => ({
  quoteService: {
    updateQuote: vi.fn(),
  },
}));

vi.mock("@/features/invoices/services/invoiceService", () => ({
  invoiceService: {
    updateInvoice: vi.fn(),
  },
}));

vi.mock("@/features/profile/services/profileService", () => ({
  profileService: {
    getProfile: vi.fn(),
  },
}));

const mockedUsePersistedReview = vi.mocked(usePersistedReview);
const mockedQuoteService = vi.mocked(quoteService);
const mockedInvoiceService = vi.mocked(invoiceService);
const mockedProfileService = vi.mocked(profileService);

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

function renderScreen(options?: {
  document?: QuoteDetail | InvoiceDetail;
  locationState?: unknown;
}): { clearDraftMock: ReturnType<typeof vi.fn> } {
  const document = options?.document ?? makeQuote();
  const clearDraftMock = vi.fn();

  useLocationMock.mockReturnValue({ state: options?.locationState ?? null });

  mockedUsePersistedReview.mockImplementation(() => {
    const [documentState, setDocumentState] = useState<QuoteDetail | InvoiceDetail | null>(document);
    const [draftState, setDraftState] = useState(
      "customer" in document ? mapInvoiceToEditDraft(document) : mapQuoteToEditDraft(document),
    );

    return {
      document: documentState,
      draft: draftState,
      setDraft: (nextDraft) => {
        setDraftState((currentDraft) =>
          typeof nextDraft === "function"
            ? nextDraft(currentDraft)
            : nextDraft,
        );
      },
      clearDraft: clearDraftMock,
      isLoadingDocument: false,
      loadError: null,
      refreshDocument: async (refreshOptions?: { reseedDraft?: boolean }) => {
        if (refreshOptions?.reseedDraft && documentState) {
          setDraftState("customer" in documentState ? mapInvoiceToEditDraft(documentState) : mapQuoteToEditDraft(documentState));
        }
        setDocumentState(documentState);
        return documentState as QuoteDetail | InvoiceDetail;
      },
    };
  });

  render(
    <MemoryRouter>
      <DocumentEditScreen />
    </MemoryRouter>,
  );

  return { clearDraftMock };
}

beforeEach(() => {
  mockedProfileService.getProfile.mockResolvedValue({
    id: "user-1",
    email: "owner@example.com",
    first_name: "Jamie",
    last_name: "Owner",
    business_name: "North Star Lawn",
    trade_type: "Landscaper",
    timezone: "UTC",
    default_tax_rate: null,
    has_logo: false,
    is_active: true,
    is_onboarded: true,
  });

  mockedQuoteService.updateQuote.mockResolvedValue({
    id: "doc-1",
  } as never);
  mockedInvoiceService.updateInvoice.mockResolvedValue({
    id: "doc-1",
  } as never);

  useParamsMock.mockReturnValue({ id: "doc-1" });
  useLocationMock.mockReturnValue({ state: null });
});

afterEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("DocumentEditScreen", () => {
  it("disables invoice type when no customer is selected", async () => {
    renderScreen({
      document: makeQuote({
        customer_id: null,
        customer_name: null,
        requires_customer_assignment: true,
      }),
    });

    expect(screen.getByRole("radio", { name: /invoice/i })).toBeDisabled();
  });

  it("switches to invoice mode in-place with due-date field and Create Invoice CTA", async () => {
    renderScreen();

    fireEvent.click(await screen.findByRole("radio", { name: /invoice/i }));

    expect(screen.getByLabelText(/invoice due date/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create invoice/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /continue to preview/i })).not.toBeInTheDocument();
  });

  it("keeps AI confidence notes visible after switching to invoice type", async () => {
    window.localStorage.setItem(
      "stima_review_confidence_notes:doc-1",
      JSON.stringify(["Price for item 2 was not mentioned — verify before sending."]),
    );

    renderScreen();

    expect(await screen.findByText(/price for item 2 was not mentioned/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /invoice/i }));

    expect(screen.getByText(/price for item 2 was not mentioned/i)).toBeInTheDocument();
  });

  it("locks type selector after sharing", async () => {
    renderScreen({
      document: makeQuote({ shared_at: "2026-04-01T00:00:00.000Z", status: "shared" }),
    });

    expect(await screen.findByText("Shared documents can't change type.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /quote/i })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /invoice/i })).toBeDisabled();
  });

  it("saves invoice conversion from quote and continues to invoice detail", async () => {
    renderScreen();

    fireEvent.click(await screen.findByRole("radio", { name: /invoice/i }));
    fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));

    await waitFor(() => {
      expect(mockedQuoteService.updateQuote).toHaveBeenCalledWith("doc-1", expect.objectContaining({
        doc_type: "invoice",
      }));
    });
    expect(navigateMock).toHaveBeenCalledWith("/invoices/doc-1", { replace: true });
  });

  it("saves invoice edits through invoice endpoint when document starts as invoice", async () => {
    renderScreen({ document: makeInvoice() });

    fireEvent.click(await screen.findByRole("button", { name: /save draft/i }));

    await waitFor(() => {
      expect(mockedInvoiceService.updateInvoice).toHaveBeenCalledWith("doc-1", expect.objectContaining({
        doc_type: "invoice",
      }));
    });
  });

  it("switches invoice to quote and continues to quote preview", async () => {
    renderScreen({ document: makeInvoice() });

    fireEvent.click(await screen.findByRole("radio", { name: /quote/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue to preview/i }));

    await waitFor(() => {
      expect(mockedInvoiceService.updateInvoice).toHaveBeenCalledWith("doc-1", expect.objectContaining({
        doc_type: "quote",
      }));
    });
    expect(navigateMock).toHaveBeenCalledWith("/quotes/doc-1/preview", { replace: true });
  });

  it("uses unsaved-change confirmation before navigating back", async () => {
    const { clearDraftMock } = renderScreen();

    fireEvent.change(await screen.findByLabelText(/quote title/i), {
      target: { value: "Changed title" },
    });
    fireEvent.click(screen.getByRole("button", { name: /back to quotes/i }));

    expect(screen.getByRole("dialog", { name: /leave this screen\?/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /leave without saving/i }));

    expect(clearDraftMock).toHaveBeenCalledTimes(1);
  });
});
