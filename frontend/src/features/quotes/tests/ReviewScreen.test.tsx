import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    appendExtraction: vi.fn(),
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
    expect(screen.queryByText(/assign a customer before continuing/i)).not.toBeInTheDocument();
  });

  it("keeps transcript notes collapsed by default until expanded", async () => {
    renderScreen();

    const transcriptToggle = await screen.findByRole("button", { name: /transcript notes/i });
    expect(transcriptToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("5 yards brown mulch")).not.toBeInTheDocument();

    fireEvent.click(transcriptToggle);

    expect(transcriptToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("5 yards brown mulch")).toBeInTheDocument();
  });

  it("saves draft edits through PATCH /api/quotes/:id", async () => {
    const { refreshQuoteMock } = renderScreen();

    fireEvent.change(screen.getByLabelText(/quote title/i), {
      target: { value: "Patio Refresh" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save draft$/i }));

    await waitFor(() => {
      expect(mockedQuoteService.updateQuote).toHaveBeenCalledWith("quote-1", {
        title: "Patio Refresh",
        transcript: "5 yards brown mulch",
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

  it("opens append capture from the Capture More Notes action", async () => {
    renderScreen();

    fireEvent.click(await screen.findByRole("button", { name: /capture more notes/i }));

    expect(navigateMock).toHaveBeenCalledWith("/quotes/quote-1/review/append-capture", {
      state: { launchOrigin: "/quotes/quote-1/review" },
    });
  });

  it("edits a line item in-sheet and waits to PATCH until Save Draft", async () => {
    renderScreen({
      quote: makeQuote({
        line_items: [
          {
            id: "line-1",
            description: "Brown mulch",
            details: "5 yards",
            price: 120,
            sort_order: 0,
          },
          {
            id: "line-2",
            description: "Trim hedges",
            details: "Front and sides",
            price: 90,
            sort_order: 1,
          },
          {
            id: "line-3",
            description: "Edge beds",
            details: null,
            price: 45,
            sort_order: 2,
          },
        ],
      }),
      draft: makeDraft({
        lineItems: [
          { description: "Brown mulch", details: "5 yards", price: 120 },
          { description: "Trim hedges", details: "Front and sides", price: 90 },
          { description: "Edge beds", details: null, price: 45 },
        ],
        total: 255,
      }),
    });

    fireEvent.click(screen.getByRole("button", { name: /edit line item 2/i }));

    expect(await screen.findByRole("dialog", { name: /edit line item/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toHaveValue("Trim hedges");

    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "Hedge trimming + cleanup" },
    });
    fireEvent.change(screen.getByLabelText(/price/i), {
      target: { value: "95" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /edit line item/i })).not.toBeInTheDocument();
    });

    expect(screen.getByText("Hedge trimming + cleanup")).toBeInTheDocument();
    expect(screen.getByText("$95.00")).toBeInTheDocument();
    expect(mockedQuoteService.updateQuote).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^save draft$/i }));

    await waitFor(() => {
      expect(mockedQuoteService.updateQuote).toHaveBeenCalledWith("quote-1", {
        title: "Front Yard Refresh",
        transcript: "5 yards brown mulch",
        line_items: [
          { description: "Brown mulch", details: "5 yards", price: 120 },
          { description: "Hedge trimming + cleanup", details: "Front and sides", price: 95 },
          { description: "Edge beds", details: null, price: 45 },
        ],
        total_amount: 260,
        tax_rate: null,
        discount_type: null,
        discount_value: null,
        deposit_amount: null,
        notes: "Thanks for your business",
      });
    });
  });

  it("deletes a line item in-sheet and waits to PATCH until Save Draft", async () => {
    renderScreen({
      quote: makeQuote({
        line_items: [
          {
            id: "line-1",
            description: "Brown mulch",
            details: "5 yards",
            price: 120,
            sort_order: 0,
          },
          {
            id: "line-2",
            description: "Trim hedges",
            details: "Front and sides",
            price: 90,
            sort_order: 1,
          },
        ],
      }),
      draft: makeDraft({
        lineItems: [
          { description: "Brown mulch", details: "5 yards", price: 120 },
          { description: "Trim hedges", details: "Front and sides", price: 90 },
        ],
        total: 210,
      }),
    });

    fireEvent.click(screen.getByRole("button", { name: /edit line item 2/i }));
    expect(await screen.findByRole("dialog", { name: /edit line item/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /delete line item/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /edit line item/i })).not.toBeInTheDocument();
    });

    expect(screen.queryByText("Trim hedges")).not.toBeInTheDocument();
    expect(mockedQuoteService.updateQuote).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^save draft$/i }));

    await waitFor(() => {
      expect(mockedQuoteService.updateQuote).toHaveBeenCalledWith("quote-1", {
        title: "Front Yard Refresh",
        transcript: "5 yards brown mulch",
        line_items: [
          { description: "Brown mulch", details: "5 yards", price: 120 },
        ],
        total_amount: 120,
        tax_rate: null,
        discount_type: null,
        discount_value: null,
        deposit_amount: null,
        notes: "Thanks for your business",
      });
    });
  });

  it("opens Add line item mode with empty values and appends on save", async () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: /add line item/i }));

    expect(await screen.findByRole("dialog", { name: /add line item/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toHaveValue("");
    expect(screen.getByLabelText(/details/i)).toHaveValue("");
    expect(screen.getByLabelText(/price/i)).toHaveValue("");

    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "Install flower bed edging" },
    });
    fireEvent.change(screen.getByLabelText(/details/i), {
      target: { value: "Steel edging around front bed" },
    });
    fireEvent.change(screen.getByLabelText(/price/i), {
      target: { value: "85" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /add line item/i })).not.toBeInTheDocument();
    });

    expect(screen.getByText("Install flower bed edging")).toBeInTheDocument();
    expect(screen.getByText("$85.00")).toBeInTheDocument();
  });

  it("dismisses line-item sheet on backdrop click and escape without mutating rows", async () => {
    const user = userEvent.setup();
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: /edit line item 1/i }));
    expect(await screen.findByRole("dialog", { name: /edit line item/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "Changed but unsaved" },
    });
    await user.click(screen.getByTestId("line-item-edit-sheet-overlay"));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /edit line item/i })).not.toBeInTheDocument();
    });
    expect(screen.getByText("Brown mulch")).toBeInTheDocument();
    expect(screen.queryByText("Changed but unsaved")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /edit line item 1/i }));
    expect(await screen.findByRole("dialog", { name: /edit line item/i })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText(/description/i), { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /edit line item/i })).not.toBeInTheDocument();
    });
    expect(screen.getByText("Brown mulch")).toBeInTheDocument();
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

  it("reseed refreshes persisted quote data when append-capture returns with reseed state", async () => {
    const { refreshQuoteMock } = renderScreen({
      locationState: { reseedDraft: true },
    });

    await waitFor(() => {
      expect(refreshQuoteMock).toHaveBeenCalled();
    });
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

  it("dismisses one confidence note at a time and persists only remaining notes", async () => {
    window.localStorage.setItem(
      "stima_review_confidence_notes:quote-1",
      JSON.stringify(["Verify soil depth before sending", "Double-check edging quantity"]),
    );

    renderScreen();

    expect(screen.getByText("Verify soil depth before sending")).toBeInTheDocument();
    expect(screen.getByText("Double-check edging quantity")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /dismiss confidence note/i })[0]);

    await waitFor(() => {
      expect(screen.queryByText("Verify soil depth before sending")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Double-check edging quantity")).toBeInTheDocument();
    expect(window.localStorage.getItem("stima_review_confidence_notes:quote-1")).toBe(
      JSON.stringify(["Double-check edging quantity"]),
    );

    cleanup();

    window.localStorage.setItem(
      "stima_review_confidence_notes:quote-1",
      JSON.stringify(["Double-check edging quantity"]),
    );
    renderScreen();

    expect(screen.getByText("Double-check edging quantity")).toBeInTheDocument();
    expect(screen.queryByText("Verify soil depth before sending")).not.toBeInTheDocument();
  });

  it("shows specific load errors when quote is unavailable", async () => {
    renderScreen({
      quote: null,
      loadError: "This quote can no longer be edited.",
    });

    expect(await screen.findByText("This quote can no longer be edited.")).toBeInTheDocument();
  });
});
