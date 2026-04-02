import { useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { invoiceService } from "@/features/invoices/services/invoiceService";
import { profileService } from "@/features/profile/services/profileService";
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

vi.mock("@/features/invoices/services/invoiceService", () => ({
  invoiceService: {
    createInvoice: vi.fn(),
    getInvoice: vi.fn(),
    updateInvoice: vi.fn(),
    generatePdf: vi.fn(),
    shareInvoice: vi.fn(),
  },
}));

vi.mock("@/features/profile/services/profileService", () => ({
  profileService: {
    getProfile: vi.fn(),
  },
}));

const mockedUseQuoteDraft = vi.mocked(useQuoteDraft);
const mockedQuoteService = vi.mocked(quoteService);
const mockedInvoiceService = vi.mocked(invoiceService);
const mockedProfileService = vi.mocked(profileService);

function createDeferredPromise<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}

function makeDraft(overrides: Partial<QuoteDraft> = {}): QuoteDraft {
  return {
    customerId: "cust-1",
    title: "",
    transcript: "5 yards brown mulch and edge front beds",
    lineItems: [{ description: "Brown mulch", details: "5 yards", price: null }],
    total: 120,
    taxRate: null,
    discountType: null,
    discountValue: null,
    depositAmount: null,
    confidenceNotes: [],
    notes: "",
    sourceType: "text",
    ...overrides,
  };
}

function renderScreen(initialDraft: QuoteDraft | null): void {
  mockedUseQuoteDraft.mockImplementation(() => {
    const [draft, setDraftState] = useState<QuoteDraft | null>(initialDraft);

    return {
      draft,
      setDraft: (nextDraft: QuoteDraft | ((current: QuoteDraft) => QuoteDraft)) => {
        setDraftState((currentDraft) => {
          if (!currentDraft && typeof nextDraft === "function") {
            return currentDraft;
          }
          const resolvedDraft =
            typeof nextDraft === "function" ? nextDraft(currentDraft as QuoteDraft) : nextDraft;
          setDraftMock(resolvedDraft);
          return resolvedDraft;
        });
      },
      updateLineItem: vi.fn(),
      removeLineItem: vi.fn(),
      clearDraft: () => {
        clearDraftMock();
        setDraftState(null);
      },
    };
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
    title: null,
    status: "draft",
    source_type: "text",
    transcript: "5 yards brown mulch and edge front beds",
    total_amount: 120,
    tax_rate: null,
    discount_type: null,
    discount_value: null,
    deposit_amount: null,
    notes: "",
    shared_at: null,
    share_token: null,
    line_items: [],
    created_at: "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
  });
  mockedInvoiceService.createInvoice.mockResolvedValue({
    id: "invoice-1",
    customer_id: "cust-1",
    doc_number: "I-001",
    title: null,
    status: "draft",
    total_amount: 120,
    tax_rate: null,
    discount_type: null,
    discount_value: null,
    deposit_amount: null,
    notes: "",
    due_date: "2026-04-19",
    shared_at: null,
    share_token: null,
    source_document_id: null,
    line_items: [],
    created_at: "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
  });
  mockedQuoteService.convertNotes.mockResolvedValue({
    transcript: "Corrected transcript",
    line_items: [
      {
        description: "Brown mulch",
        details: "6 yards",
        price: 275,
        flagged: true,
        flag_reason: "Verify soil depth before sending",
      },
    ],
    total: 275,
    confidence_notes: ["Verify soil depth before sending"],
  });
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
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ReviewScreen", () => {
  it("navigates back to customer capture route from header action", () => {
    renderScreen(makeDraft({ customerId: "cust-42", launchOrigin: "/customers/cust-42" }));

    fireEvent.click(screen.getByRole("button", { name: /back to capture/i }));

    expect(navigateMock).toHaveBeenCalledWith("/quotes/capture/cust-42", {
      replace: true,
      state: { launchOrigin: "/customers/cust-42" },
    });
  });

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

  it("shows transcript card with edit affordance when transcript is present", () => {
    renderScreen(makeDraft({ transcript: "5 yards brown mulch\nEdge front beds" }));

    const transcriptDetails = screen.getByText("TRANSCRIPT").closest("details");
    expect(transcriptDetails).toBeInTheDocument();
    if (!transcriptDetails) {
      throw new Error("Expected transcript details section to render");
    }

    expect(transcriptDetails).not.toHaveAttribute("open");
    expect(within(transcriptDetails).getByText(/5 yards brown mulch/i)).toHaveTextContent(
      "5 yards brown mulch Edge front beds",
    );
    expect(screen.getByRole("button", { name: /edit transcript notes/i })).toBeInTheDocument();
  });

  it("shows an empty transcript state and edit affordance when transcript is blank", () => {
    renderScreen(makeDraft({ transcript: "   " }));

    expect(screen.getByText("TRANSCRIPT")).toBeInTheDocument();
    expect(screen.getByText(/no transcript captured yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit transcript notes/i })).toBeInTheDocument();
  });

  it("shows review-required guidance when confidence notes exist", () => {
    renderScreen(makeDraft({ confidenceNotes: ["Price for edging is uncertain"] }));

    expect(screen.getByText(/review required before generating/i)).toBeInTheDocument();
    expect(screen.getByText(/price for edging is uncertain/i)).toBeInTheDocument();
  });

  it("shows review-required guidance when a line item is flagged", () => {
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

    expect(screen.getByText(/review required before generating/i)).toBeInTheDocument();
    expect(screen.getByText(/brown mulch: unit phrasing may be ambiguous/i)).toBeInTheDocument();
  });

  it("hides review guidance when there are no confidence notes and no flagged items", () => {
    renderScreen(
      makeDraft({
        lineItems: [{ description: "Brown mulch", details: "5 yards", price: 120 }],
      }),
    );

    expect(screen.queryByText(/review required before generating/i)).not.toBeInTheDocument();
  });

  it("shows a clearer null-price warning when any submitted line item has no price", () => {
    renderScreen(makeDraft());

    expect(screen.getByText(/review required before generating/i)).toBeInTheDocument();
    expect(screen.getByText(/render as "TBD" when the quote is shared/i)).toBeInTheDocument();
  });

  it("hides the null-price warning when all submitted line items have prices", () => {
    renderScreen(
      makeDraft({
        lineItems: [{ description: "Brown mulch", details: "5 yards", price: 120 }],
      }),
    );

    expect(screen.queryByText(/render as "TBD" when the quote is shared/i)).not.toBeInTheDocument();
  });

  it("keeps quote generation enabled and removes the sticky footer warning when prices are missing", () => {
    renderScreen(makeDraft());

    expect(screen.queryByText(/review missing prices before sharing/i)).not.toBeInTheDocument();
    expect(screen.getByText(/render as "TBD" when the quote is shared/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^generate quote$/i })).toBeEnabled();
  });

  it("lets users edit transcript notes locally", async () => {
    const user = userEvent.setup();
    renderScreen(makeDraft());

    await user.click(screen.getByRole("button", { name: /edit transcript notes/i }));

    const textarea = screen.getByRole("textbox", { name: /transcript notes/i });
    expect(textarea).toHaveValue("5 yards brown mulch and edge front beds");

    await user.clear(textarea);
    await user.type(textarea, "Corrected transcript");

    expect(textarea).toHaveValue("Corrected transcript");
    expect(setDraftMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ transcript: "Corrected transcript" }),
    );
  });

  it("uses token-backed surfaces for editable transcript and customer notes", async () => {
    const user = userEvent.setup();
    renderScreen(makeDraft());

    await user.click(screen.getByRole("button", { name: /edit transcript notes/i }));

    expect(screen.getByRole("textbox", { name: /transcript notes/i })).toHaveClass(
      "bg-surface-container-high",
      "text-on-surface",
    );
    expect(screen.getByRole("textbox", { name: /customer notes/i })).toHaveClass(
      "bg-surface-container-high",
      "text-on-surface",
    );
  });

  it("regenerates directly from the edited transcript when no line items exist", async () => {
    const user = userEvent.setup();
    renderScreen(makeDraft({ lineItems: [], total: null }));

    await user.click(screen.getByRole("button", { name: /edit transcript notes/i }));
    const textarea = screen.getByRole("textbox", { name: /transcript notes/i });
    await user.clear(textarea);
    await user.type(textarea, "Corrected transcript");
    await user.click(screen.getByRole("button", { name: /regenerate from transcript/i }));

    await waitFor(() => {
      expect(mockedQuoteService.convertNotes).toHaveBeenCalledWith("Corrected transcript");
    });
    expect(screen.queryByRole("dialog", { name: /replace current draft/i })).not.toBeInTheDocument();
  });

  it("shows a confirmation modal before regeneration when line items exist", async () => {
    const user = userEvent.setup();
    renderScreen(makeDraft());

    await user.click(screen.getByRole("button", { name: /edit transcript notes/i }));
    await user.click(screen.getByRole("button", { name: /regenerate from transcript/i }));

    expect(screen.getByRole("dialog", { name: /replace current draft/i })).toBeInTheDocument();
    expect(mockedQuoteService.convertNotes).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /replace draft/i }));

    await waitFor(() => {
      expect(mockedQuoteService.convertNotes).toHaveBeenCalledWith(
        "5 yards brown mulch and edge front beds",
      );
    });
  });

  it("blocks quote submission while regeneration is pending", async () => {
    const user = userEvent.setup();
    const regeneration = createDeferredPromise<Awaited<ReturnType<typeof quoteService.convertNotes>>>();
    mockedQuoteService.convertNotes.mockReturnValueOnce(regeneration.promise);
    renderScreen(makeDraft());

    await user.click(screen.getByRole("button", { name: /edit transcript notes/i }));
    await user.click(screen.getByRole("button", { name: /regenerate from transcript/i }));
    await user.click(screen.getByRole("button", { name: /replace draft/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^generate quote$/i })).toBeDisabled();
    });

    await user.click(screen.getByRole("button", { name: /^generate quote$/i }));
    expect(mockedQuoteService.createQuote).not.toHaveBeenCalled();

    regeneration.resolve({
      transcript: "Corrected transcript",
      line_items: [{ description: "Brown mulch", details: "6 yards", price: 275 }],
      total: 275,
      confidence_notes: [],
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^generate quote$/i })).toBeEnabled();
    });
  });

  it("replaces transcript, line items, total, and confidence notes after successful regeneration", async () => {
    const user = userEvent.setup();
    mockedQuoteService.convertNotes.mockResolvedValueOnce({
      transcript: "Corrected transcript",
      line_items: [
        {
          description: "Compost top dress",
          details: "Front beds",
          price: 275,
          flagged: true,
          flag_reason: "Verify soil depth before sending",
        },
      ],
      total: 275,
      confidence_notes: ["Verify soil depth before sending"],
    });
    renderScreen(makeDraft({ notes: "Keep customer note" }));

    await user.click(screen.getByRole("button", { name: /edit transcript notes/i }));
    const textarea = screen.getByRole("textbox", { name: /transcript notes/i });
    await user.clear(textarea);
    await user.type(textarea, "Corrected transcript");
    await user.click(screen.getByRole("button", { name: /regenerate from transcript/i }));
    await user.click(screen.getByRole("button", { name: /replace draft/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /compost top dress/i })).toBeInTheDocument();
    });

    expect(screen.getByText("Corrected transcript")).toBeInTheDocument();
    expect(screen.getByDisplayValue("275")).toBeInTheDocument();
    expect(screen.getByText(/verify soil depth before sending/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /customer notes/i })).toHaveValue("Keep customer note");
    expect(screen.queryByRole("textbox", { name: /transcript notes/i })).not.toBeInTheDocument();
  });

  it("locks customer notes during regeneration and preserves them after success", async () => {
    const user = userEvent.setup();
    const regeneration = createDeferredPromise<Awaited<ReturnType<typeof quoteService.convertNotes>>>();
    mockedQuoteService.convertNotes.mockReturnValueOnce(regeneration.promise);
    renderScreen(makeDraft({ notes: "Keep customer note" }));

    await user.click(screen.getByRole("button", { name: /edit transcript notes/i }));
    await user.click(screen.getByRole("button", { name: /regenerate from transcript/i }));
    await user.click(screen.getByRole("button", { name: /replace draft/i }));

    const customerNotes = screen.getByRole("textbox", { name: /customer notes/i });
    await waitFor(() => {
      expect(customerNotes).toBeDisabled();
    });

    regeneration.resolve({
      transcript: "Corrected transcript",
      line_items: [{ description: "Brown mulch", details: "6 yards", price: 275 }],
      total: 275,
      confidence_notes: [],
    });

    await waitFor(() => {
      expect(customerNotes).toBeEnabled();
    });
    expect(customerNotes).toHaveValue("Keep customer note");
  });

  it("preserves the edited transcript and current draft when regeneration fails", async () => {
    const user = userEvent.setup();
    mockedQuoteService.convertNotes.mockRejectedValueOnce(new Error("Unable to regenerate draft"));
    renderScreen(makeDraft({ notes: "Keep customer note" }));

    await user.click(screen.getByRole("button", { name: /edit transcript notes/i }));
    const textarea = screen.getByRole("textbox", { name: /transcript notes/i });
    await user.clear(textarea);
    await user.type(textarea, "Corrected transcript");
    await user.click(screen.getByRole("button", { name: /regenerate from transcript/i }));
    await user.click(screen.getByRole("button", { name: /replace draft/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to regenerate draft");
    expect(screen.getByRole("textbox", { name: /transcript notes/i })).toHaveValue(
      "Corrected transcript",
    );
    expect(screen.getByRole("button", { name: /brown mulch/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue("120")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /customer notes/i })).toHaveValue("Keep customer note");
  });

  it("adds a blank manual line item", () => {
    renderScreen(makeDraft());

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /add line item/i }));
    });

    expect(setDraftMock).toHaveBeenCalledWith({
      customerId: "cust-1",
      title: "",
      transcript: "5 yards brown mulch and edge front beds",
      lineItems: [
        { description: "Brown mulch", details: "5 yards", price: null },
        { description: "", details: null, price: null },
      ],
      total: 120,
      taxRate: null,
      discountType: null,
      discountValue: null,
      depositAmount: null,
      confidenceNotes: [],
      notes: "",
      sourceType: "text",
    });
  });

  it("creates quote, clears draft, and navigates to preview", async () => {
    renderScreen(makeDraft({ title: "  Front Yard Refresh  ", notes: "Thanks for your business" }));

    fireEvent.click(screen.getByRole("button", { name: /^generate quote$/i }));

    await waitFor(() => {
      expect(mockedQuoteService.createQuote).toHaveBeenCalledWith({
        customer_id: "cust-1",
        title: "Front Yard Refresh",
        transcript: "5 yards brown mulch and edge front beds",
        line_items: [{ description: "Brown mulch", details: "5 yards", price: null }],
        total_amount: 120,
        tax_rate: null,
        discount_type: null,
        discount_value: null,
        deposit_amount: null,
        notes: "Thanks for your business",
        source_type: "text",
      });
    });
    expect(clearDraftMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith("/quotes/quote-1/preview");
  });

  it("allows quote creation after discount is toggled back off", async () => {
    const user = userEvent.setup();
    renderScreen(
      makeDraft({
        lineItems: [{ description: "Brown mulch", details: "5 yards", price: 120 }],
        discountType: "fixed",
        discountValue: null,
      }),
    );

    await user.click(screen.getByRole("checkbox", { name: /discount/i }));
    await user.click(screen.getByRole("button", { name: /^generate quote$/i }));

    await waitFor(() => {
      expect(mockedQuoteService.createQuote).toHaveBeenCalledWith(
        expect.objectContaining({
          discount_type: null,
          discount_value: null,
        }),
      );
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("creates a direct invoice when invoice is selected", async () => {
    const user = userEvent.setup();
    renderScreen(makeDraft({ title: "  Front Yard Refresh  ", notes: "Thanks for your business" }));

    await user.click(screen.getByRole("radio", { name: /invoice/i }));
    expect(screen.getByRole("button", { name: /^create invoice$/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^create invoice$/i }));

    await waitFor(() => {
      expect(mockedInvoiceService.createInvoice).toHaveBeenCalledWith({
        customer_id: "cust-1",
        title: "Front Yard Refresh",
        transcript: "5 yards brown mulch and edge front beds",
        line_items: [{ description: "Brown mulch", details: "5 yards", price: null }],
        total_amount: 120,
        tax_rate: null,
        discount_type: null,
        discount_value: null,
        deposit_amount: null,
        notes: "Thanks for your business",
        source_type: "text",
      });
    });
    expect(mockedQuoteService.createQuote).not.toHaveBeenCalled();
    expect(clearDraftMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith("/invoices/invoice-1");
  });

  it("shows save error when create fails", async () => {
    mockedQuoteService.createQuote.mockRejectedValueOnce(new Error("Unable to create quote"));
    renderScreen(makeDraft());

    fireEvent.click(screen.getByRole("button", { name: /^generate quote$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to create quote");
  });

  it("shows save error when direct invoice creation fails", async () => {
    const user = userEvent.setup();
    mockedInvoiceService.createInvoice.mockRejectedValueOnce(new Error("Unable to create invoice"));
    renderScreen(makeDraft());

    await user.click(screen.getByRole("radio", { name: /invoice/i }));
    await user.click(screen.getByRole("button", { name: /^create invoice$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to create invoice");
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

    fireEvent.click(screen.getByRole("button", { name: /^generate quote$/i }));

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

    fireEvent.click(screen.getByRole("button", { name: /^generate quote$/i }));

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

    const submitButton = screen.getByRole("button", { name: /^generate quote$/i });
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

    expect(screen.getByRole("button", { name: /^generate quote$/i })).toBeDisabled();
  });

  it("disables submit when there are no line items", () => {
    renderScreen(
      makeDraft({
        lineItems: [],
      }),
    );

    expect(screen.getByText("No line items extracted yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^generate quote$/i })).toBeDisabled();
  });

  it("redirects to home when no draft is available", async () => {
    renderScreen(null);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
    });
  });
});
