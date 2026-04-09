import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewScreen } from "@/features/quotes/components/ReviewScreen";
import { customerService } from "@/features/customers/services/customerService";
import { profileService } from "@/features/profile/services/profileService";
import { usePersistedReview } from "@/features/quotes/hooks/usePersistedReview";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteEditDraft } from "@/features/quotes/hooks/useQuoteEdit";
import type { QuoteDetail } from "@/features/quotes/types/quote.types";
import { calculatePricingFromPersisted, resolveLineItemSum } from "@/shared/lib/pricing";

const navigateMock = vi.fn();
const useParamsMock = vi.fn(() => ({ id: "quote-1" }));
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
    extract: vi.fn(),
    convertNotes: vi.fn(),
    captureAudio: vi.fn(),
    createQuote: vi.fn(),
    listQuotes: vi.fn(),
    getQuote: vi.fn(),
    updateQuote: vi.fn(),
    deleteQuote: vi.fn(),
    generatePdf: vi.fn(),
    shareQuote: vi.fn(),
    sendQuoteEmail: vi.fn(),
    markQuoteWon: vi.fn(),
    markQuoteLost: vi.fn(),
    convertToInvoice: vi.fn(),
  },
}));

vi.mock("@/features/profile/services/profileService", () => ({
  profileService: {
    getProfile: vi.fn(),
  },
}));

vi.mock("@/features/customers/services/customerService", () => ({
  customerService: {
    listCustomers: vi.fn(),
    createCustomer: vi.fn(),
    getCustomer: vi.fn(),
    updateCustomer: vi.fn(),
  },
}));

const mockedUsePersistedReview = vi.mocked(usePersistedReview);
const mockedQuoteService = vi.mocked(quoteService);
const mockedProfileService = vi.mocked(profileService);
const mockedCustomerService = vi.mocked(customerService);

function makeQuote(overrides: Partial<QuoteDetail> = {}): QuoteDetail {
  return {
    id: "quote-1",
    customer_id: "cust-1",
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

function makeDraft(overrides: Partial<QuoteEditDraft> = {}): QuoteEditDraft {
  return {
    quoteId: "quote-1",
    title: "Front Yard Refresh",
    transcript: "5 yards brown mulch",
    lineItems: [{ description: "Brown mulch", details: "5 yards", price: 120 }],
    total: 120,
    taxRate: null,
    discountType: null,
    discountValue: null,
    depositAmount: null,
    notes: "Thanks for your business",
    ...overrides,
  };
}

function mapQuoteToDraft(quote: QuoteDetail): QuoteEditDraft {
  const lineItemSum = resolveLineItemSum(quote.line_items.map((item) => item.price));
  const breakdown = calculatePricingFromPersisted(
    {
      totalAmount: quote.total_amount,
      taxRate: quote.tax_rate,
      discountType: quote.discount_type,
      discountValue: quote.discount_value,
      depositAmount: quote.deposit_amount,
    },
    lineItemSum,
  );

  return {
    quoteId: quote.id,
    title: quote.title?.trim() ?? "",
    transcript: quote.transcript,
    lineItems: quote.line_items.map((item) => ({
      description: item.description,
      details: item.details,
      price: item.price,
    })),
    total: breakdown.subtotal ?? quote.total_amount,
    taxRate: quote.tax_rate,
    discountType: quote.discount_type,
    discountValue: quote.discount_value,
    depositAmount: quote.deposit_amount,
    notes: quote.notes ?? "",
  };
}

function renderScreen(options?: {
  quote?: QuoteDetail | null;
  draft?: QuoteEditDraft;
  locationState?: unknown;
  refreshedQuote?: QuoteDetail;
  loadError?: string | null;
  isLoadingQuote?: boolean;
}): {
  clearDraftMock: ReturnType<typeof vi.fn>;
  refreshQuoteMock: ReturnType<typeof vi.fn>;
} {
  const quote = options?.quote ?? makeQuote();
  const draft = options?.draft ?? makeDraft();
  const clearDraftMock = vi.fn();
  const refreshQuoteMock = vi.fn();

  useLocationMock.mockReturnValue({ state: options?.locationState ?? null });

  mockedUsePersistedReview.mockImplementation(() => {
    const [quoteState, setQuoteState] = useState<QuoteDetail | null>(quote);
    const [draftState, setDraftState] = useState<QuoteEditDraft | null>(draft);

    return {
      quote: quoteState,
      draft: draftState,
      setDraft: (nextDraft: QuoteEditDraft | ((current: QuoteEditDraft) => QuoteEditDraft)) => {
        setDraftState((currentDraft) => {
          if (!currentDraft && typeof nextDraft === "function") {
            return currentDraft;
          }
          return typeof nextDraft === "function"
            ? nextDraft(currentDraft as QuoteEditDraft)
            : nextDraft;
        });
      },
      clearDraft: clearDraftMock,
      isLoadingQuote: options?.isLoadingQuote ?? false,
      loadError: options?.loadError ?? null,
      refreshQuote: async (refreshOptions?: { reseedDraft?: boolean }) => {
        const nextQuote = options?.refreshedQuote ?? quoteState;
        if (nextQuote) {
          setQuoteState(nextQuote);
          if (refreshOptions?.reseedDraft) {
            setDraftState(mapQuoteToDraft(nextQuote));
          }
        }
        refreshQuoteMock();
        return nextQuote as QuoteDetail;
      },
    };
  });

  render(
    <MemoryRouter>
      <ReviewScreen />
    </MemoryRouter>,
  );

  return {
    clearDraftMock,
    refreshQuoteMock,
  };
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
    id: "quote-1",
    customer_id: "cust-1",
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
  });
  mockedCustomerService.listCustomers.mockResolvedValue([
    {
      id: "cust-1",
      name: "Alice Johnson",
      phone: "+1-555-0100",
      email: "alice@example.com",
      address: null,
      created_at: "2026-03-20T00:00:00.000Z",
      updated_at: "2026-03-20T00:00:00.000Z",
    },
    {
      id: "cust-2",
      name: "Bob Brown",
      phone: "+1-555-0200",
      email: "bob@example.com",
      address: null,
      created_at: "2026-03-20T00:00:00.000Z",
      updated_at: "2026-03-20T00:00:00.000Z",
    },
  ]);

  window.localStorage.clear();
  useParamsMock.mockReturnValue({ id: "quote-1" });
  useLocationMock.mockReturnValue({ state: null });
});

afterEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("ReviewScreen", () => {
  it("renders persisted unassigned review state and disables continue", async () => {
    renderScreen({
      quote: makeQuote({
        customer_id: null,
        customer_name: null,
        requires_customer_assignment: true,
      }),
    });

    expect(await screen.findByText("Customer: Unassigned")).toBeInTheDocument();
    expect(await screen.findByText("Needs customer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue to preview/i })).toBeDisabled();
    expect(screen.getByText(/disabled until a customer is assigned/i)).toBeInTheDocument();
  });

  it("saves draft edits through PATCH /api/quotes/:id", async () => {
    const { refreshQuoteMock } = renderScreen();

    fireEvent.change(screen.getByLabelText(/quote title/i), {
      target: { value: "Patio Refresh" },
    });
    fireEvent.change(screen.getByLabelText(/transcript notes/i), {
      target: { value: "Updated transcript" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save draft$/i }));

    await waitFor(() => {
      expect(mockedQuoteService.updateQuote).toHaveBeenCalledWith("quote-1", {
        title: "Patio Refresh",
        transcript: "Updated transcript",
        line_items: [{ description: "Brown mulch", details: "5 yards", price: 120 }],
        total_amount: 120,
        tax_rate: null,
        discount_type: null,
        discount_value: null,
        deposit_amount: null,
        notes: "Thanks for your business",
      });
    });

    expect(refreshQuoteMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Draft saved.")).toBeInTheDocument();
  });

  it("does not show leave warning after save when server canonicalizes pricing", async () => {
    renderScreen({
      refreshedQuote: makeQuote({
        title: "Patio Refresh",
        transcript: "Updated transcript",
        total_amount: 108,
        tax_rate: 0.08,
        line_items: [
          {
            id: "line-1",
            description: "Brown mulch",
            details: "5 yards",
            price: 100,
            sort_order: 0,
          },
        ],
      }),
    });

    fireEvent.change(screen.getByLabelText(/quote title/i), {
      target: { value: "Patio Refresh " },
    });
    fireEvent.change(screen.getByLabelText(/transcript notes/i), {
      target: { value: "Updated transcript" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save draft$/i }));

    expect(await screen.findByText("Draft saved.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /back to quotes/i }));

    expect(screen.queryByRole("dialog", { name: /leave this screen\?/i })).not.toBeInTheDocument();
    expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
  });

  it("opens the customer assignment sheet and patches selected customer", async () => {
    renderScreen({
      quote: makeQuote({
        customer_id: null,
        customer_name: null,
        requires_customer_assignment: true,
      }),
      refreshedQuote: makeQuote({
        customer_id: "cust-2",
        customer_name: "Bob Brown",
        requires_customer_assignment: false,
      }),
    });

    fireEvent.change(screen.getByLabelText(/quote title/i), {
      target: { value: "Unsaved local title" },
    });
    fireEvent.click(screen.getByRole("button", { name: /customer: unassigned/i }));

    expect(await screen.findByRole("dialog", { name: /assign customer/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /bob brown/i }));

    await waitFor(() => {
      expect(mockedQuoteService.updateQuote).toHaveBeenCalledWith("quote-1", {
        customer_id: "cust-2",
      });
    });
    expect(screen.getByLabelText(/quote title/i)).toHaveValue("Unsaved local title");
  });

  it("uses preview-origin route state for notice and back navigation", async () => {
    renderScreen({
      locationState: {
        origin: "preview",
        notice: "Assign a customer before continuing to preview.",
      },
    });

    expect(
      await screen.findByText("Assign a customer before continuing to preview."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /back to preview/i }));

    expect(navigateMock).toHaveBeenCalledWith("/quotes/quote-1/preview", { replace: true });
  });

  it("routes back to quotes when preview-origin quote still needs customer assignment", async () => {
    renderScreen({
      quote: makeQuote({
        customer_id: null,
        customer_name: null,
        requires_customer_assignment: true,
      }),
      locationState: {
        origin: "preview",
        notice: "Assign a customer before continuing to preview.",
      },
    });

    await screen.findByText("Assign a customer before continuing to preview.");
    fireEvent.click(screen.getByRole("button", { name: /back to quotes/i }));

    expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
  });

  it("shows leave warning for unsaved edits before navigating away", async () => {
    const { clearDraftMock } = renderScreen();

    fireEvent.change(screen.getByLabelText(/quote title/i), {
      target: { value: "Changed title" },
    });
    fireEvent.click(screen.getByRole("button", { name: /back to quotes/i }));

    expect(screen.getByRole("dialog", { name: /leave this screen\?/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^stay$/i }));
    expect(screen.queryByRole("dialog", { name: /leave this screen\?/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /back to quotes/i }));
    fireEvent.click(screen.getByRole("button", { name: /leave without saving/i }));

    expect(clearDraftMock).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
    });
  });

  it("dismisses confidence notes per quote fingerprint and re-shows when notes change", async () => {
    window.localStorage.setItem(
      "stima_review_confidence_notes:quote-1",
      JSON.stringify(["Verify soil depth before sending"]),
    );

    renderScreen();

    expect(screen.getByText("Verify soil depth before sending")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /dismiss confidence note/i }));

    await waitFor(() => {
      expect(screen.queryByText("Verify soil depth before sending")).not.toBeInTheDocument();
    });

    cleanup();

    window.localStorage.setItem(
      "stima_review_confidence_notes:quote-1",
      JSON.stringify(["Verify soil depth before sending"]),
    );
    renderScreen();

    expect(screen.queryByText("Verify soil depth before sending")).not.toBeInTheDocument();

    window.localStorage.setItem(
      "stima_review_confidence_notes:quote-1",
      JSON.stringify(["Double-check edging quantity"]),
    );
    cleanup();
    renderScreen();

    expect(await screen.findByText("Double-check edging quantity")).toBeInTheDocument();
  });

  it("shows specific load errors when quote is unavailable", async () => {
    renderScreen({
      quote: null,
      loadError: "This quote can no longer be edited.",
    });

    expect(await screen.findByText("This quote can no longer be edited.")).toBeInTheDocument();
  });
});
