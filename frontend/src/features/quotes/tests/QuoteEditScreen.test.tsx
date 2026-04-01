import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QuoteEditScreen } from "@/features/quotes/components/QuoteEditScreen";
import type { QuoteEditDraft } from "@/features/quotes/hooks/useQuoteEdit";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteDetail } from "@/features/quotes/types/quote.types";

const EDIT_STORAGE_KEY = "stima_quote_edit";
const navigateMock = vi.fn();
const useParamsMock = vi.fn(() => ({ id: "quote-1" }));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => useParamsMock(),
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
    generatePdf: vi.fn(),
    shareQuote: vi.fn(),
  },
}));

const mockedQuoteService = vi.mocked(quoteService);

function makeQuoteDetail(overrides: Partial<QuoteDetail> = {}): QuoteDetail {
  return {
    id: "quote-1",
    customer_id: "cust-1",
    customer_name: "Test Customer",
    customer_email: null,
    customer_phone: null,
    doc_number: "Q-001",
    title: null,
    status: "ready",
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
    linked_invoice: null,
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
    title: "",
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

function renderScreen(): void {
  render(
    <MemoryRouter>
      <QuoteEditScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  useParamsMock.mockReturnValue({ id: "quote-1" });
  mockedQuoteService.getQuote.mockResolvedValue(makeQuoteDetail());
  mockedQuoteService.updateQuote.mockResolvedValue({
    id: "quote-1",
    customer_id: "cust-1",
    doc_number: "Q-001",
    title: "Patio Refresh",
    status: "draft",
    source_type: "text",
    transcript: "5 yards brown mulch",
    total_amount: 145,
    tax_rate: null,
    discount_type: null,
    discount_value: null,
    deposit_amount: null,
    notes: "Updated note",
    shared_at: null,
    share_token: null,
    line_items: [],
    created_at: "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
  });
});

afterEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

describe("QuoteEditScreen", () => {
  it("seeds edit state from the fetched quote when no edit draft exists", async () => {
    renderScreen();

    await waitFor(() => {
      expect(mockedQuoteService.getQuote).toHaveBeenCalledWith("quote-1");
    });
    await waitFor(() => {
      expect(JSON.parse(window.sessionStorage.getItem(EDIT_STORAGE_KEY) ?? "")).toEqual({
        quoteId: "quote-1",
        title: "",
        lineItems: [{ description: "Brown mulch", details: "5 yards", price: 120 }],
        total: 120,
        taxRate: null,
        discountType: null,
        discountValue: null,
        depositAmount: null,
        notes: "Thanks for your business",
      });
    });
  });

  it("seeds subtotal from persisted pricing when discount is active and preserves it on save", async () => {
    mockedQuoteService.getQuote.mockResolvedValueOnce(
      makeQuoteDetail({
        total_amount: 110,
        discount_type: "fixed",
        discount_value: 10,
        tax_rate: null,
        line_items: [
          {
            id: "line-1",
            description: "Brown mulch",
            details: "5 yards",
            price: 120,
            sort_order: 0,
          },
        ],
      }),
    );

    renderScreen();

    await waitFor(() => {
      expect(JSON.parse(window.sessionStorage.getItem(EDIT_STORAGE_KEY) ?? "")).toEqual({
        quoteId: "quote-1",
        title: "",
        lineItems: [{ description: "Brown mulch", details: "5 yards", price: 120 }],
        total: 120,
        taxRate: null,
        discountType: "fixed",
        discountValue: 10,
        depositAmount: null,
        notes: "Thanks for your business",
      });
    });

    expect(await screen.findByRole("spinbutton", { name: /subtotal/i })).toHaveValue(120);

    fireEvent.change(screen.getByLabelText(/customer notes/i), {
      target: { value: "Notes only change" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockedQuoteService.updateQuote).toHaveBeenCalledWith("quote-1", {
        title: null,
        line_items: [{ description: "Brown mulch", details: "5 yards", price: 120 }],
        total_amount: 120,
        tax_rate: null,
        discount_type: "fixed",
        discount_value: 10,
        deposit_amount: null,
        notes: "Notes only change",
      });
    });
  });

  it("shows a load error when the quote fetch fails", async () => {
    mockedQuoteService.getQuote.mockRejectedValueOnce(new Error("Unable to load quote"));

    renderScreen();

    expect(await screen.findByText("Unable to load quote")).toBeInTheDocument();
    expect(mockedQuoteService.updateQuote).not.toHaveBeenCalled();
  });

  it.each(["shared", "viewed", "approved", "declined"] as const)(
    "keeps customer-visible quotes editable in the editor (%s)",
    async (status) => {
      window.sessionStorage.setItem(EDIT_STORAGE_KEY, JSON.stringify(makeDraft()));
      mockedQuoteService.getQuote.mockResolvedValueOnce(
        makeQuoteDetail({ status, share_token: "share-token-1" }),
      );

      renderScreen();

      expect(await screen.findByRole("heading", { name: "Q-001" })).toBeInTheDocument();
      expect(navigateMock).not.toHaveBeenCalledWith("/quotes/quote-1/preview", { replace: true });
      expect(window.sessionStorage.getItem(EDIT_STORAGE_KEY)).not.toBeNull();
    },
  );

  it("saves changes, clears the edit draft, and navigates back to preview", async () => {
    window.sessionStorage.setItem(EDIT_STORAGE_KEY, JSON.stringify(makeDraft()));

    renderScreen();

    expect(await screen.findByRole("heading", { name: "Q-001" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/quote title/i), {
      target: { value: "  Patio Refresh  " },
    });
    fireEvent.change(screen.getByLabelText(/customer notes/i), {
      target: { value: "Updated note" },
    });
    fireEvent.change(screen.getByLabelText(/total amount/i), {
      target: { value: "145" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockedQuoteService.updateQuote).toHaveBeenCalledWith("quote-1", {
        title: "Patio Refresh",
        line_items: [{ description: "Brown mulch", details: "5 yards", price: 120 }],
        total_amount: 145,
        tax_rate: null,
        discount_type: null,
        discount_value: null,
        deposit_amount: null,
        notes: "Updated note",
      });
    });
    expect(window.sessionStorage.getItem(EDIT_STORAGE_KEY)).toBeNull();
    expect(navigateMock).toHaveBeenCalledWith("/quotes/quote-1/preview");
  });

  it("falls back to the doc number after clearing a saved title and submits null", async () => {
    mockedQuoteService.getQuote.mockResolvedValueOnce(
      makeQuoteDetail({
        title: "Patio Refresh",
      }),
    );

    renderScreen();

    expect(await screen.findByRole("heading", { name: "Patio Refresh" })).toBeInTheDocument();
    expect(
      screen.getByText("Q-001 · QUOTE EDITOR"),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/quote title/i), {
      target: { value: "   " },
    });

    expect(screen.getByRole("heading", { name: "Q-001" })).toBeInTheDocument();
    expect(screen.getByText("QUOTE EDITOR")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockedQuoteService.updateQuote).toHaveBeenCalledWith("quote-1", {
        title: null,
        line_items: [{ description: "Brown mulch", details: "5 yards", price: 120 }],
        total_amount: 120,
        tax_rate: null,
        discount_type: null,
        discount_value: null,
        deposit_amount: null,
        notes: "Thanks for your business",
      });
    });
  });

  it("blocks save when a line item has details or price but no description", async () => {
    window.sessionStorage.setItem(
      EDIT_STORAGE_KEY,
      JSON.stringify(
        makeDraft({
          lineItems: [{ description: "   ", details: "5 yards", price: 120 }],
        }),
      ),
    );

    renderScreen();

    expect(await screen.findByRole("heading", { name: "Q-001" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(
      await screen.findByText("Each line item with details or price needs a description."),
    ).toBeInTheDocument();
    expect(mockedQuoteService.updateQuote).not.toHaveBeenCalled();
  });

  it("navigates to the line item edit route when a card is clicked", async () => {
    window.sessionStorage.setItem(EDIT_STORAGE_KEY, JSON.stringify(makeDraft()));

    renderScreen();

    const lineItemCard = await screen.findByRole("button", { name: /brown mulch/i });
    fireEvent.click(lineItemCard);

    expect(navigateMock).toHaveBeenCalledWith("/quotes/quote-1/edit/line-items/0/edit");
  });

  it("clears the edit draft and returns to preview on cancel", async () => {
    window.sessionStorage.setItem(EDIT_STORAGE_KEY, JSON.stringify(makeDraft()));

    renderScreen();

    await screen.findByRole("heading", { name: "Q-001" });
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(window.sessionStorage.getItem(EDIT_STORAGE_KEY)).toBeNull();
    expect(navigateMock).toHaveBeenCalledWith("/quotes/quote-1/preview");
  });
});
