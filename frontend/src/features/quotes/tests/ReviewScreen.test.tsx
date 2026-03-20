import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewScreen } from "@/features/quotes/components/ReviewScreen";
import { useQuoteDraft, type QuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";
import { quoteService } from "@/features/quotes/services/quoteService";

const navigateMock = vi.fn();
const setDraftMock = vi.fn();
const clearDraftMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("@/features/quotes/hooks/useQuoteDraft", () => ({
  useQuoteDraft: vi.fn(),
}));

vi.mock("@/features/quotes/services/quoteService", () => ({
  quoteService: {
    convertNotes: vi.fn(),
    createQuote: vi.fn(),
    getQuote: vi.fn(),
    updateQuote: vi.fn(),
    generatePdf: vi.fn(),
    shareQuote: vi.fn(),
  },
}));

const mockedUseQuoteDraft = vi.mocked(useQuoteDraft);
const mockedQuoteService = vi.mocked(quoteService);

function makeDraft(overrides: Partial<QuoteDraft> = {}): QuoteDraft {
  return {
    customerId: "cust-1",
    transcript: "5 yards brown mulch and edge front beds",
    lineItems: [{ description: "Brown mulch", details: "5 yards", price: null }],
    total: 120,
    confidenceNotes: [],
    notes: "",
    ...overrides,
  };
}

function renderScreen(draft: QuoteDraft | null): void {
  mockedUseQuoteDraft.mockReturnValue({
    draft,
    setDraft: setDraftMock,
    clearDraft: clearDraftMock,
  });

  render(
    <MemoryRouter>
      <ReviewScreen />
    </MemoryRouter>,
  );
}

function renderScreenWithHookState(initialDraft: QuoteDraft | null): void {
  function useQuoteDraftStateMock(): {
    draft: QuoteDraft | null;
    setDraft: (nextDraft: QuoteDraft) => void;
    clearDraft: () => void;
  } {
    const [draft, setDraft] = useState<QuoteDraft | null>(initialDraft);

    return {
      draft,
      setDraft: (nextDraft: QuoteDraft) => setDraft(nextDraft),
      clearDraft: () => {
        clearDraftMock();
        setDraft(null);
      },
    };
  }

  mockedUseQuoteDraft.mockImplementation(useQuoteDraftStateMock);

  render(
    <MemoryRouter>
      <ReviewScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockedQuoteService.createQuote.mockResolvedValue({
    id: "quote-1",
    customer_id: "cust-1",
    doc_number: "Q-001",
    status: "draft",
    source_type: "text",
    transcript: "5 yards brown mulch and edge front beds",
    total_amount: 120,
    notes: "",
    shared_at: null,
    share_token: null,
    line_items: [],
    created_at: "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ReviewScreen", () => {
  it("renders line items from draft", () => {
    renderScreen(makeDraft());

    expect(screen.getByDisplayValue("Brown mulch")).toBeInTheDocument();
  });

  it("renders null price as empty field", () => {
    renderScreen(makeDraft({ lineItems: [{ description: "Mulch", details: null, price: null }] }));

    expect(screen.getByLabelText(/price/i)).toHaveValue(null);
  });

  it("updates line item description", () => {
    renderScreen(makeDraft());

    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "Premium mulch" },
    });

    expect(setDraftMock).toHaveBeenCalledWith({
      customerId: "cust-1",
      transcript: "5 yards brown mulch and edge front beds",
      lineItems: [{ description: "Premium mulch", details: "5 yards", price: null }],
      total: 120,
      confidenceNotes: [],
      notes: "",
    });
  });

  it("deletes a line item", () => {
    renderScreen(
      makeDraft({
        lineItems: [
          { description: "Brown mulch", details: "5 yards", price: null },
          { description: "Edging", details: null, price: 40 },
        ],
      }),
    );

    fireEvent.click(screen.getAllByRole("button", { name: /delete/i })[0]);

    expect(setDraftMock).toHaveBeenCalledWith({
      customerId: "cust-1",
      transcript: "5 yards brown mulch and edge front beds",
      lineItems: [{ description: "Edging", details: null, price: 40 }],
      total: 120,
      confidenceNotes: [],
      notes: "",
    });
  });

  it("adds a new empty line item row", () => {
    renderScreen(makeDraft());

    fireEvent.click(screen.getByRole("button", { name: /add line item/i }));

    expect(setDraftMock).toHaveBeenCalledWith({
      customerId: "cust-1",
      transcript: "5 yards brown mulch and edge front beds",
      lineItems: [
        { description: "Brown mulch", details: "5 yards", price: null },
        { description: "", details: null, price: null },
      ],
      total: 120,
      confidenceNotes: [],
      notes: "",
    });
  });

  it("disables Generate Quote PDF when no line items have a description", () => {
    renderScreen(makeDraft({ lineItems: [] }));

    expect(screen.getByRole("button", { name: /generate quote pdf/i })).toBeDisabled();
  });

  it("enables Generate Quote PDF when at least one line item has description", () => {
    renderScreen(makeDraft());

    expect(screen.getByRole("button", { name: /generate quote pdf/i })).toBeEnabled();
  });

  it("renders transcript card in read-only section", () => {
    renderScreen(makeDraft());

    expect(screen.getByText("Transcript")).toBeInTheDocument();
    expect(screen.getByText(/5 yards brown mulch and edge front beds/i)).toBeInTheDocument();
  });

  it("renders confidence notes when present", () => {
    renderScreen(makeDraft({ confidenceNotes: ["Price for edging is uncertain"] }));

    expect(screen.getByText("Confidence notes")).toBeInTheDocument();
    expect(screen.getByText("Price for edging is uncertain")).toBeInTheDocument();
  });

  it("updates notes textarea", () => {
    renderScreen(makeDraft());

    fireEvent.change(screen.getByLabelText(/^notes$/i), {
      target: { value: "Thanks for your business" },
    });

    expect(setDraftMock).toHaveBeenCalledWith({
      customerId: "cust-1",
      transcript: "5 yards brown mulch and edge front beds",
      lineItems: [{ description: "Brown mulch", details: "5 yards", price: null }],
      total: 120,
      confidenceNotes: [],
      notes: "Thanks for your business",
    });
  });

  it("creates quote, clears draft, and navigates to preview route", async () => {
    renderScreen(makeDraft({ notes: "See you next week" }));

    fireEvent.click(screen.getByRole("button", { name: /generate quote pdf/i }));

    await waitFor(() => {
      expect(mockedQuoteService.createQuote).toHaveBeenCalledWith({
        customer_id: "cust-1",
        transcript: "5 yards brown mulch and edge front beds",
        line_items: [{ description: "Brown mulch", details: "5 yards", price: null }],
        total_amount: 120,
        notes: "See you next week",
      });
    });
    expect(clearDraftMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith("/quotes/quote-1/preview");
  });

  it("keeps description input focused while typing so rows do not remount", () => {
    renderScreenWithHookState(makeDraft());

    const descriptionInput = screen.getByLabelText(/description/i);
    descriptionInput.focus();
    fireEvent.change(descriptionInput, {
      target: { value: "Premium mulch" },
    });

    const updatedInput = screen.getByLabelText(/description/i);
    expect(updatedInput).toHaveValue("Premium mulch");
    expect(updatedInput).toHaveFocus();
  });

  it("sanitizes blank rows before submit and sends only described line items", async () => {
    renderScreen(makeDraft({
      lineItems: [
        { description: "Brown mulch", details: "5 yards", price: null },
        { description: "", details: null, price: null },
      ],
      notes: "See you next week",
    }));

    fireEvent.click(screen.getByRole("button", { name: /generate quote pdf/i }));

    await waitFor(() => {
      expect(mockedQuoteService.createQuote).toHaveBeenCalledWith({
        customer_id: "cust-1",
        transcript: "5 yards brown mulch and edge front beds",
        line_items: [{ description: "Brown mulch", details: "5 yards", price: null }],
        total_amount: 120,
        notes: "See you next week",
      });
    });
  });

  it("shows row-level description validation and blocks submit for partially filled blank-description rows", () => {
    renderScreen(makeDraft({
      lineItems: [{ description: "", details: "Needs two workers", price: 45 }],
    }));

    expect(screen.getByText("Description is required for this row.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate quote pdf/i })).toBeDisabled();
  });
});
