import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { lineItemCatalogService } from "@/features/line-item-catalog/services/lineItemCatalogService";
import { DocumentEditScreen } from "@/features/quotes/components/ReviewScreen";
import { mapQuoteToEditDraft, usePersistedReview } from "@/features/quotes/hooks/usePersistedReview";
import { invoiceService } from "@/features/invoices/services/invoiceService";
import { profileService } from "@/features/profile/services/profileService";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteDetail } from "@/features/quotes/types/quote.types";
import { ToastProvider } from "@/ui/Toast";

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

vi.mock("@/features/line-item-catalog/services/lineItemCatalogService", () => ({
  lineItemCatalogService: {
    listItems: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
  },
}));

vi.mock("@/features/quotes/services/quoteService", () => ({
  quoteService: {
    updateQuote: vi.fn(),
    updateExtractionReviewMetadata: vi.fn(),
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
const mockedLineItemCatalogService = vi.mocked(lineItemCatalogService);
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
    extraction_review_metadata: {
      pipeline_version: "v2.5",
      review_state: {
        notes_pending: false,
        pricing_pending: false,
      },
      seeded_fields: {
        notes: { seeded: false, confidence: null, source: null },
        pricing: {
          explicit_total: { seeded: false, source: null },
          deposit_amount: { seeded: false, source: null },
          tax_rate: { seeded: false, source: null },
          discount: { seeded: false, source: null },
        },
      },
      hidden_details: {
        items: [],
      },
      hidden_detail_state: {},
      extraction_degraded_reason_code: null,
    },
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

function renderScreen(document: QuoteDetail): void {
  useLocationMock.mockReturnValue({ state: null });

  mockedUsePersistedReview.mockImplementation(() => {
    const [documentState] = useState<QuoteDetail | null>(document);
    const [draftState, setDraftState] = useState(mapQuoteToEditDraft(document));

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
      clearDraft: vi.fn(),
      isLoadingDocument: false,
      loadError: null,
      refreshDocument: async () => document,
    };
  });

  render(
    <MemoryRouter>
      <ToastProvider>
        <DocumentEditScreen />
      </ToastProvider>
    </MemoryRouter>,
  );
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

  mockedQuoteService.updateQuote.mockResolvedValue({ id: "doc-1" } as never);
  mockedQuoteService.updateExtractionReviewMetadata.mockResolvedValue({
    pipeline_version: "v2.5",
    review_state: {
      notes_pending: false,
      pricing_pending: false,
    },
    seeded_fields: {
      notes: { seeded: false, confidence: null, source: null },
      pricing: {
        explicit_total: { seeded: false, source: null },
        deposit_amount: { seeded: false, source: null },
        tax_rate: { seeded: false, source: null },
        discount: { seeded: false, source: null },
      },
    },
    hidden_details: { items: [] },
    hidden_detail_state: {},
    extraction_degraded_reason_code: null,
  });
  mockedInvoiceService.updateInvoice.mockResolvedValue({ id: "doc-1" } as never);

  mockedLineItemCatalogService.createItem.mockResolvedValue({
    id: "catalog-1",
    title: "Brown mulch",
    details: "5 yards",
    defaultPrice: 120,
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z",
  });
  mockedLineItemCatalogService.listItems.mockResolvedValue([
    {
      id: "catalog-1",
      title: "Spring Cleanup",
      details: "Blow out beds",
      defaultPrice: 180,
      createdAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-04-20T00:00:00.000Z",
    },
  ]);

  useParamsMock.mockReturnValue({ id: "doc-1" });
  useLocationMock.mockReturnValue({ state: null });
});

describe("DocumentEditScreen line item catalog integration", () => {
  it("saves to catalog via catalog API without quote persistence", async () => {
    renderScreen(makeQuote());

    fireEvent.click(await screen.findByRole("button", { name: /edit line item 1: brown mulch/i }));
    const dialog = screen.getByRole("dialog", { name: /edit line item/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /save to catalog/i }));

    await waitFor(() => {
      expect(mockedLineItemCatalogService.createItem).toHaveBeenCalledWith({
        title: "Brown mulch",
        details: "5 yards",
        defaultPrice: 120,
      });
    });
    expect(mockedQuoteService.updateQuote).not.toHaveBeenCalled();
  });

  it("loads catalog on tab activation and inserts selected item into local draft", async () => {
    renderScreen(makeQuote({ line_items: [] }));

    expect(mockedLineItemCatalogService.listItems).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: /add line item/i }));
    fireEvent.click(screen.getByRole("tab", { name: /catalog/i }));

    await waitFor(() => {
      expect(mockedLineItemCatalogService.listItems).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: /insert/i }));

    expect(
      await screen.findByRole("button", { name: /edit line item 1: spring cleanup/i }),
    ).toBeInTheDocument();
    expect(mockedQuoteService.updateQuote).not.toHaveBeenCalled();
  });
});
