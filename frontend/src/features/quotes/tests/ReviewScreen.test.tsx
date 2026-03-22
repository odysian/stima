import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    sourceType: "text",
    ...overrides,
  };
}

function renderScreen(draft: QuoteDraft | null): void {
  mockedUseQuoteDraft.mockReturnValue({
    draft,
    setDraft: setDraftMock,
    updateLineItem: vi.fn(),
    removeLineItem: vi.fn(),
    clearDraft: clearDraftMock,
  });

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
  it("renders line items as cards and navigates to edit route on click", () => {
    renderScreen(
      makeDraft({
        lineItems: [{ description: "Brown mulch", details: "5 yards", price: 120 }],
      }),
    );

    const lineItemCard = screen.getByRole("button", { name: /brown mulch/i });
    expect(lineItemCard).toBeInTheDocument();

    fireEvent.click(lineItemCard);
    expect(navigateMock).toHaveBeenCalledWith("/quotes/review/line-items/0/edit");
  });

  it("shows AI banner when confidence notes exist", () => {
    renderScreen(makeDraft({ confidenceNotes: ["Price for edging is uncertain"] }));

    expect(screen.getByText(/ai confidence note/i)).toBeInTheDocument();
    expect(screen.getByText(/price for edging is uncertain/i)).toBeInTheDocument();
  });

  it("shows AI banner when a line item is flagged even without confidence notes", () => {
    renderScreen(
      makeDraft({
        lineItems: [
          {
            description: "Brown mulch",
            details: "5 yards",
            price: null,
            flagged: true,
            flagReason: "Unit phrasing may be ambiguous",
          },
        ],
      }),
    );

    expect(screen.getByText(/ai confidence note/i)).toBeInTheDocument();
  });

  it("hides AI banner when there are no confidence notes and no flagged items", () => {
    renderScreen(makeDraft());

    expect(screen.queryByText(/ai confidence note/i)).not.toBeInTheDocument();
  });

  it("adds a blank manual line item", () => {
    renderScreen(makeDraft());

    fireEvent.click(screen.getByRole("button", { name: /\+ add manual line item/i }));

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
      sourceType: "text",
    });
  });

  it("creates quote, clears draft, and navigates to preview", async () => {
    renderScreen(makeDraft({ notes: "Thanks for your business" }));

    fireEvent.click(screen.getByRole("button", { name: /generate quote >/i }));

    await waitFor(() => {
      expect(mockedQuoteService.createQuote).toHaveBeenCalledWith({
        customer_id: "cust-1",
        transcript: "5 yards brown mulch and edge front beds",
        line_items: [{ description: "Brown mulch", details: "5 yards", price: null }],
        total_amount: 120,
        notes: "Thanks for your business",
        source_type: "text",
      });
    });
    expect(clearDraftMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith("/quotes/quote-1/preview");
  });

  it("filters blank rows before submit and only sends described line items", async () => {
    renderScreen(
      makeDraft({
        lineItems: [
          { description: "Brown mulch", details: "5 yards", price: null },
          { description: "", details: null, price: null },
        ],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /generate quote >/i }));

    await waitFor(() => {
      expect(mockedQuoteService.createQuote).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [{ description: "Brown mulch", details: "5 yards", price: null }],
        }),
      );
    });
  });

  it("strips flagged metadata before submit payload", async () => {
    renderScreen(
      makeDraft({
        lineItems: [
          {
            description: "Brown mulch",
            details: "5 yards",
            price: null,
            flagged: true,
            flagReason: "Unit phrasing may be ambiguous",
          },
        ],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /generate quote >/i }));

    await waitFor(() => {
      expect(mockedQuoteService.createQuote).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [{ description: "Brown mulch", details: "5 yards", price: null }],
        }),
      );
    });
  });

  it("blocks submit when a partially filled row has blank description", () => {
    renderScreen(
      makeDraft({
        lineItems: [{ description: "", details: "Needs two workers", price: 45 }],
      }),
    );

    const submitButton = screen.getByRole("button", { name: /generate quote >/i });
    expect(submitButton).toBeDisabled();
    fireEvent.click(submitButton);
    expect(mockedQuoteService.createQuote).not.toHaveBeenCalled();
  });

  it("disables submit when no line items have a description", () => {
    renderScreen(
      makeDraft({
        lineItems: [{ description: "", details: null, price: null }],
      }),
    );

    expect(screen.getByRole("button", { name: /generate quote >/i })).toBeDisabled();
  });
});
