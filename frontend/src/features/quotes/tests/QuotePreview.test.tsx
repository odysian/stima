import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QuotePreview } from "@/features/quotes/components/QuotePreview";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { JobStatusResponse, Quote, QuoteDetail } from "@/features/quotes/types/quote.types";
import { HttpRequestError } from "@/shared/lib/http";
import { jobService } from "@/shared/lib/jobService";

vi.mock("@/features/quotes/services/quoteService", () => ({
  quoteService: {
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

vi.mock("@/shared/lib/jobService", () => ({
  jobService: {
    getJobStatus: vi.fn(),
  },
}));

const mockedQuoteService = vi.mocked(quoteService);
const mockedJobService = vi.mocked(jobService);

function makePdfArtifact(
  overrides: Partial<QuoteDetail["pdf_artifact"]> = {},
): QuoteDetail["pdf_artifact"] {
  return {
    status: "missing",
    job_id: null,
    download_url: null,
    terminal_error: null,
    ...overrides,
  };
}

function makeQuoteDetail(overrides: Partial<QuoteDetail> = {}): QuoteDetail {
  return {
    id: "quote-1",
    customer_id: "cust-1",
    customer_name: "Test Customer",
    customer_email: null,
    customer_phone: null,
    doc_number: "Q-001",
    title: null,
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
    linked_invoice: null,
    pdf_artifact: makePdfArtifact(),
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

function makeQuoteResponse(overrides: Partial<Quote> = {}): Quote {
  return {
    id: "quote-1",
    customer_id: "cust-1",
    doc_number: "Q-001",
    title: null,
    status: "shared",
    source_type: "text",
    transcript: "5 yards brown mulch",
    total_amount: 120,
    tax_rate: null,
    discount_type: null,
    discount_value: null,
    deposit_amount: null,
    notes: "Thanks for your business",
    shared_at: "2026-03-20T01:00:00.000Z",
    share_token: "share-token-1",
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
    updated_at: "2026-03-20T01:00:00.000Z",
    ...overrides,
  };
}

function renderScreen(
  path = "/quotes/quote-1/preview",
  options?: {
    initialEntries?: string[];
    initialIndex?: number;
  },
): void {
  render(
    <MemoryRouter initialEntries={options?.initialEntries ?? [path]} initialIndex={options?.initialIndex}>
      <Routes>
        <Route path="/quotes/:id/preview" element={<QuotePreview />} />
        <Route path="/quotes/:id/review" element={<div>Review Quote Screen</div>} />
        <Route path="/invoices/:id" element={<div>Invoice Detail Screen</div>} />
        <Route path="/" element={<div>Quote List Screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openOverflowMenu(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
}

beforeEach(() => {
  const pendingEmailJob: JobStatusResponse = {
    id: "job-email-quote-1",
    user_id: "user-1",
    document_id: "quote-1",
    document_revision: null,
    job_type: "email",
    status: "pending",
    attempts: 0,
    terminal_error: null,
    extraction_result: null,
    quote_id: null,
    created_at: "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
  };
  const pendingPdfJob: JobStatusResponse = {
    ...pendingEmailJob,
    id: "job-pdf-quote-1",
    document_revision: 0,
    job_type: "pdf",
  };
  const successfulPdfJob: JobStatusResponse = {
    ...pendingPdfJob,
    status: "success",
    attempts: 1,
  };

  mockedQuoteService.getQuote.mockResolvedValue(makeQuoteDetail());
  mockedQuoteService.generatePdf.mockResolvedValue(pendingPdfJob);
  mockedQuoteService.deleteQuote.mockResolvedValue(undefined);
  mockedQuoteService.shareQuote.mockResolvedValue(makeQuoteResponse());
  mockedQuoteService.sendQuoteEmail.mockResolvedValue(pendingEmailJob);
  mockedQuoteService.markQuoteWon.mockResolvedValue(
    makeQuoteResponse({ status: "approved" }),
  );
  mockedQuoteService.markQuoteLost.mockResolvedValue(
    makeQuoteResponse({ status: "declined" }),
  );
  mockedQuoteService.convertToInvoice.mockResolvedValue({
    id: "invoice-1",
    customer_id: "cust-1",
    doc_number: "I-001",
    title: "Spring Cleanup",
    status: "draft",
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
  mockedJobService.getJobStatus.mockResolvedValue(successfulPdfJob);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    writable: true,
    value: undefined,
  });
  window.history.replaceState({ idx: 0 }, "");
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("QuotePreview", () => {
  it("fetches quote on mount, uses customer name as the header title, and renders header actions", async () => {
    renderScreen();

    await waitFor(() => {
      expect(mockedQuoteService.getQuote).toHaveBeenCalledWith("quote-1");
    });

    expect(await screen.findByRole("heading", { name: "Test Customer" })).toBeInTheDocument();
    expect(screen.getByText("Q-001")).toBeInTheDocument();
    expect(screen.getAllByText("Draft")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /edit quote/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /more actions/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /share quote/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/doc\/share-token/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /quotes/i })).toHaveClass("text-primary");
    expect(screen.getByText("QUOTE")).toBeInTheDocument();
  });

  it.each(["approved", "declined"] as const)(
    "keeps edit, outcome actions, and resend actions available when the quote is %s",
    async (status) => {
      mockedQuoteService.getQuote.mockResolvedValueOnce(
        makeQuoteDetail({
          status,
          share_token: "share-token-1",
          customer_email: "customer@example.com",
          pdf_artifact: makePdfArtifact({
            status: "ready",
            download_url: "/api/quotes/quote-1/pdf",
          }),
        }),
      );

      renderScreen();

      await screen.findByRole("heading", { name: "Test Customer" });
      expect(screen.getByRole("button", { name: /edit quote/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /more actions/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /resend email/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /open pdf/i })).toBeInTheDocument();
    },
  );

  it.each(["ready", "shared", "viewed", "approved", "declined"] as const)(
    "shows convert to invoice for %s quotes without a linked invoice",
    async (status) => {
      mockedQuoteService.getQuote.mockResolvedValueOnce(
        makeQuoteDetail({ status, share_token: "share-token-1" }),
      );

      renderScreen();

      await screen.findByRole("heading", { name: "Test Customer" });
      expect(screen.getByRole("button", { name: /convert to invoice/i })).toBeInTheDocument();
      expect(screen.getByText("No invoice yet")).toBeInTheDocument();
    },
  );

  it("demotes draft convert-to-invoice UI below the quote actions", async () => {
    mockedQuoteService.getQuote.mockResolvedValueOnce(
      makeQuoteDetail({ status: "draft", share_token: null }),
    );

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    const generatePdfButton = screen.getByRole("button", { name: /generate pdf/i });
    const convertButton = screen.getByRole("button", { name: /convert to invoice/i });

    expect(generatePdfButton.compareDocumentPosition(convertButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(generatePdfButton).toHaveClass("forest-gradient");
    expect(convertButton).not.toHaveClass("forest-gradient");
    expect(convertButton).toHaveClass("border");
    expect(screen.getByText("No invoice yet")).toBeInTheDocument();
    expect(screen.queryByText(/fine-tune the due date before sharing/i)).not.toBeInTheDocument();
  });

  it("keeps convert to invoice secondary when the quote is ready", async () => {
    mockedQuoteService.getQuote.mockResolvedValueOnce(
      makeQuoteDetail({ status: "ready", share_token: "share-token-1" }),
    );

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    const convertButton = screen.getByRole("button", { name: /convert to invoice/i });

    expect(convertButton).not.toHaveClass("forest-gradient");
    expect(convertButton).toHaveClass("border");
    expect(screen.queryByText(/fine-tune the due date before sharing/i)).not.toBeInTheDocument();
  });

  it.each(["draft", "ready", "shared", "viewed", "approved", "declined"] as const)(
    "shows the linked invoice summary when a %s quote already has one",
    async (status) => {
      mockedQuoteService.getQuote.mockResolvedValueOnce(
        makeQuoteDetail({
          status,
          share_token: "share-token-1",
          linked_invoice: {
            id: "invoice-1",
            doc_number: "I-001",
            status: "sent",
            due_date: "2026-04-19",
            total_amount: 120,
            created_at: "2026-03-20T00:00:00.000Z",
          },
        }),
      );

      renderScreen();

      await screen.findByRole("heading", { name: "Test Customer" });
      expect(screen.getByText("I-001")).toBeInTheDocument();
      expect(screen.getByText("Sent")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /open invoice/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /convert to invoice/i })).not.toBeInTheDocument();
    },
  );

  it("converts a draft quote to an invoice and navigates to the invoice detail screen", async () => {
    mockedQuoteService.getQuote.mockResolvedValueOnce(
      makeQuoteDetail({ status: "draft", share_token: "share-token-1" }),
    );

    renderScreen();

    fireEvent.click(await screen.findByRole("button", { name: /convert to invoice/i }));

    await waitFor(() => {
      expect(mockedQuoteService.convertToInvoice).toHaveBeenCalledWith("quote-1");
    });

    expect(await screen.findByText("Invoice Detail Screen")).toBeInTheDocument();
  });

  it("recovers from duplicate invoice conflicts using structured HTTP errors", async () => {
    mockedQuoteService.getQuote
      .mockResolvedValueOnce(makeQuoteDetail({ status: "declined", share_token: "share-token-1" }))
      .mockResolvedValueOnce(
        makeQuoteDetail({
          status: "declined",
          linked_invoice: {
            id: "invoice-1",
            doc_number: "I-001",
            status: "draft",
            due_date: "2026-04-19",
            total_amount: 120,
            created_at: "2026-03-20T00:00:00.000Z",
          },
        }),
      );
    mockedQuoteService.convertToInvoice.mockRejectedValueOnce(
      new HttpRequestError("conflict", 409, {
        detail: "An invoice already exists for this quote",
      }),
    );

    renderScreen();

    fireEvent.click(await screen.findByRole("button", { name: /convert to invoice/i }));

    await waitFor(() => {
      expect(mockedQuoteService.convertToInvoice).toHaveBeenCalledWith("quote-1");
    });
    await waitFor(() => {
      expect(mockedQuoteService.getQuote).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText("Invoice Detail Screen")).toBeInTheDocument();
  });

  it.each(["shared", "viewed"] as const)(
    "keeps edit and follow-up actions available for %s quotes",
    async (status) => {
      mockedQuoteService.getQuote.mockResolvedValueOnce(
        makeQuoteDetail({
          status,
          share_token: "share-token-1",
          customer_email: "customer@example.com",
        }),
      );

      renderScreen();

      await screen.findByRole("heading", { name: "Test Customer" });
      expect(screen.getByRole("button", { name: /edit quote/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /more actions/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /resend email/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();

      await openOverflowMenu();

      expect(screen.getByRole("menuitem", { name: /mark as won/i })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /mark as lost/i })).toBeInTheDocument();
    },
  );

  it.each(["viewed", "approved", "declined"] as const)(
    "does not render the removed status strip for %s quotes",
    async (status) => {
      mockedQuoteService.getQuote.mockResolvedValueOnce(
        makeQuoteDetail({
          status,
          share_token: "share-token-1",
          updated_at: "2026-03-22T15:45:00.000Z",
        }),
      );

      renderScreen();

      await screen.findByRole("heading", { name: "Test Customer" });
      expect(screen.queryByLabelText(/quote status/i)).not.toBeInTheDocument();
    },
  );

  it("shows generate pdf as primary with send and copy utilities when the quote is ready", async () => {
    mockedQuoteService.getQuote.mockResolvedValueOnce(
      makeQuoteDetail({
        status: "ready",
        customer_email: "customer@example.com",
      }),
    );

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    expect(screen.getByRole("button", { name: /generate pdf/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open pdf/i })).not.toBeInTheDocument();
    const utilities = screen.getByRole("group", { name: /quote utilities/i });
    expect(within(utilities).getByRole("button", { name: /send email/i })).toBeInTheDocument();
    expect(within(utilities).getByRole("button", { name: /copy link/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/quote status/i)).not.toBeInTheDocument();
  });

  it("renders quote title as the primary header when present", async () => {
    mockedQuoteService.getQuote.mockResolvedValueOnce(
      makeQuoteDetail({ title: "Front Yard Refresh" }),
    );

    renderScreen();

    expect(await screen.findByRole("heading", { name: "Front Yard Refresh" })).toBeInTheDocument();
    expect(screen.getAllByText("Q-001").length).toBeGreaterThan(0);
  });

  it("falls back to customer name for the header title and keeps doc number as subtitle", async () => {
    mockedQuoteService.getQuote.mockResolvedValueOnce(
      makeQuoteDetail({
        title: null,
        customer_name: "Explicit Customer",
      }),
    );

    renderScreen();

    expect(await screen.findByRole("heading", { name: "Explicit Customer" })).toBeInTheDocument();
    expect(screen.getByText("Q-001")).toBeInTheDocument();
  });

  it("uses the durable artifact download URL for shared quotes", async () => {
    mockedQuoteService.getQuote.mockResolvedValueOnce(
      makeQuoteDetail({
        status: "shared",
        share_token: "share-token-1",
        pdf_artifact: makePdfArtifact({
          status: "ready",
          download_url: "/api/quotes/quote-1/pdf",
        }),
      }),
    );

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    expect(screen.getByRole("link", { name: /open pdf/i })).toHaveAttribute(
      "href",
      "/api/quotes/quote-1/pdf",
    );
    expect(screen.queryByText("http://localhost:3000/doc/share-token-1")).not.toBeInTheDocument();
  });

  it("marks a shared quote as won after confirmation and refetches the closed state", async () => {
    mockedQuoteService.getQuote
      .mockResolvedValueOnce(makeQuoteDetail({ status: "shared", share_token: "share-token-1" }))
      .mockResolvedValueOnce(
        makeQuoteDetail({ status: "approved", share_token: "share-token-1" }),
      );

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    await openOverflowMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /mark as won/i }));

    const dialog = screen.getByRole("dialog", { name: /mark quote as won\?/i });
    expect(
      within(dialog).getByText(
        "This records the quote as won. You can still view the quote and its PDF.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /mark as won/i }));

    await waitFor(() => {
      expect(mockedQuoteService.markQuoteWon).toHaveBeenCalledWith("quote-1");
    });
    await waitFor(() => {
      expect(mockedQuoteService.getQuote).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByRole("button", { name: /resend email/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/quote status/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /more actions/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit quote/i })).toBeInTheDocument();
  });

  it("shows the lost confirmation modal and refetches the declined state after confirmation", async () => {
    mockedQuoteService.getQuote
      .mockResolvedValueOnce(makeQuoteDetail({ status: "shared", share_token: "share-token-1" }))
      .mockResolvedValueOnce(
        makeQuoteDetail({ status: "declined", share_token: "share-token-1" }),
      );

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    await openOverflowMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /mark as lost/i }));

    const dialog = screen.getByRole("dialog", { name: /mark quote as lost\?/i });
    expect(
      within(dialog).getByText(
        "This records the quote as lost. You can still view the quote and its PDF.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /mark as lost/i }));

    await waitFor(() => {
      expect(mockedQuoteService.markQuoteLost).toHaveBeenCalledWith("quote-1");
    });
    await waitFor(() => {
      expect(mockedQuoteService.getQuote).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByRole("button", { name: /resend email/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/quote status/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /more actions/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit quote/i })).toBeInTheDocument();
  });

  it("clears existing share feedback before marking the quote won", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      writable: true,
      value: { writeText: writeTextMock },
    });
    mockedQuoteService.getQuote
      .mockResolvedValueOnce(makeQuoteDetail({ status: "shared", share_token: "share-token-1" }))
      .mockResolvedValueOnce(
        makeQuoteDetail({ status: "approved", share_token: "share-token-1" }),
      );

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("http://localhost:3000/doc/share-token-1");
    });
    expect(await screen.findByText("Share link copied to clipboard.")).toBeInTheDocument();

    await openOverflowMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /mark as won/i }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: /mark quote as won\?/i })).getByRole("button", {
        name: /mark as won/i,
      }),
    );

    await waitFor(() => {
      expect(mockedQuoteService.markQuoteWon).toHaveBeenCalledWith("quote-1");
    });
    expect(screen.queryByText("Share link copied to clipboard.")).not.toBeInTheDocument();
  });

  it("navigates to the canonical review route from the header action", async () => {
    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    fireEvent.click(screen.getByRole("button", { name: /edit quote/i }));

    expect(await screen.findByText("Review Quote Screen")).toBeInTheDocument();
  });

  it("redirects unassigned quotes from preview to review with guidance", async () => {
    mockedQuoteService.getQuote.mockResolvedValueOnce(
      makeQuoteDetail({
        customer_id: null,
        customer_name: null,
        requires_customer_assignment: true,
      }),
    );

    renderScreen();

    expect(await screen.findByText("Review Quote Screen")).toBeInTheDocument();
  });

  it("shows an error when quote fetch fails", async () => {
    mockedQuoteService.getQuote.mockRejectedValueOnce(new Error("Unable to load quote"));

    renderScreen();

    expect(await screen.findByText("Unable to load quote")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate pdf/i })).not.toBeInTheDocument();
  });

  it("shows loading state while fetching quote", () => {
    mockedQuoteService.getQuote.mockImplementationOnce(() => new Promise<QuoteDetail>(() => {}));

    renderScreen();

    expect(screen.getByRole("status")).toHaveTextContent("Loading quote...");
    expect(screen.queryByRole("button", { name: /generate pdf/i })).not.toBeInTheDocument();
  });

  it("renders amount and falls back to customer_id when customer details are unavailable", async () => {
    mockedQuoteService.getQuote.mockResolvedValueOnce(
      makeQuoteDetail({
        total_amount: 245.5,
        customer_name: " ",
      }),
    );

    renderScreen();

    expect(await screen.findByText("$245.50")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Q-001" })).toBeInTheDocument();
    expect(screen.getAllByText("cust-1")).toHaveLength(1);
    expect(screen.getByText("No contact details")).toBeInTheDocument();
  });

  it("prefers the customer phone over email in the client card contact line", async () => {
    mockedQuoteService.getQuote.mockResolvedValueOnce(
      makeQuoteDetail({
        customer_email: "customer@example.com",
        customer_phone: "+1-555-0199",
      }),
    );

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    expect(screen.getByText("+1-555-0199")).toBeInTheDocument();
    expect(screen.queryByText("customer@example.com")).not.toBeInTheDocument();
  });

  it("renders the pricing breakdown when optional pricing controls are present", async () => {
    mockedQuoteService.getQuote.mockResolvedValueOnce(
      makeQuoteDetail({
        total_amount: 99,
        tax_rate: 0.1,
        discount_type: "fixed",
        discount_value: 10,
        deposit_amount: 40,
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
    );

    renderScreen();

    expect(await screen.findByText("Subtotal")).toBeInTheDocument();
    expect(screen.getByText("Discount")).toBeInTheDocument();
    expect(screen.getByText("Tax")).toBeInTheDocument();
    expect(screen.getByText("Deposit")).toBeInTheDocument();
    expect(screen.getByText("Balance Due")).toBeInTheDocument();
    expect(screen.getByText("-$10.00")).toBeInTheDocument();
    expect(screen.getByText("$9.00")).toBeInTheDocument();
    expect(screen.getByText("$59.00")).toBeInTheDocument();
  });

  it("renders quote line items with details and TBD for missing prices", async () => {
    mockedQuoteService.getQuote.mockResolvedValueOnce(
      makeQuoteDetail({
        total_amount: 300,
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
            description: "Edge front beds",
            details: null,
            price: null,
            sort_order: 1,
          },
        ],
      }),
    );

    renderScreen();

    expect(await screen.findByRole("heading", { name: "LINE ITEMS" })).toBeInTheDocument();
    expect(screen.getByText("2 ITEMS")).toBeInTheDocument();
    expect(screen.getByText("Brown mulch")).toBeInTheDocument();
    expect(screen.getByText("5 yards")).toBeInTheDocument();
    expect(within(screen.getByRole("list")).getByText("$120.00")).toBeInTheDocument();
    expect(screen.getByText("Edge front beds")).toBeInTheDocument();
    expect(screen.getByText("TBD")).toBeInTheDocument();
  });

  it("keeps details and line items above the primary action area", async () => {
    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });

    const detailsHeading = screen.getByText("CLIENT");
    const lineItemsHeading = screen.getByRole("heading", { name: "LINE ITEMS" });
    const primaryAction = screen.getByRole("button", { name: /generate pdf/i });

    expect(detailsHeading.compareDocumentPosition(primaryAction) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(lineItemsHeading.compareDocumentPosition(primaryAction) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps generate pdf primary on draft and unlocks send email after generation", async () => {
    mockedQuoteService.getQuote
      .mockResolvedValueOnce(makeQuoteDetail({ customer_email: "customer@example.com" }))
      .mockResolvedValueOnce(
        makeQuoteDetail({
          customer_email: "customer@example.com",
          pdf_artifact: makePdfArtifact({ status: "pending", job_id: "job-pdf-quote-1" }),
        }),
      )
      .mockResolvedValueOnce(
        makeQuoteDetail({
          status: "ready",
          customer_email: "customer@example.com",
          share_token: "share-token-1",
          pdf_artifact: makePdfArtifact({
            status: "ready",
            download_url: "/api/quotes/quote-1/pdf",
          }),
        }),
      );

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    expect(screen.queryByRole("button", { name: /send email/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /copy link/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /generate pdf/i }));

    await waitFor(() => {
      expect(mockedQuoteService.generatePdf).toHaveBeenCalledWith("quote-1");
    });

    const utilities = screen.getByRole("group", { name: /quote utilities/i });
    expect(within(utilities).getByRole("button", { name: /send email/i })).toBeEnabled();
    expect(within(utilities).getByRole("button", { name: /copy link/i })).toBeEnabled();
    expect(screen.getByRole("link", { name: /open pdf/i })).toHaveAttribute(
      "href",
      "/api/quotes/quote-1/pdf",
    );
    expect(screen.queryByLabelText(/quote status/i)).not.toBeInTheDocument();
    await openOverflowMenu();
    expect(screen.getByRole("menuitem", { name: /delete quote/i })).toBeInTheDocument();
  });

  it("resumes a pending PDF job on mount and refreshes the quote to ready", async () => {
    mockedQuoteService.getQuote
      .mockResolvedValueOnce(
        makeQuoteDetail({
          customer_email: "customer@example.com",
          pdf_artifact: makePdfArtifact({ status: "pending", job_id: "job-pdf-quote-1" }),
        }),
      )
      .mockResolvedValueOnce(
        makeQuoteDetail({
          status: "ready",
          customer_email: "customer@example.com",
          share_token: "share-token-1",
          pdf_artifact: makePdfArtifact({
            status: "ready",
            download_url: "/api/quotes/quote-1/pdf",
          }),
        }),
      );

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });

    await waitFor(() => {
      expect(mockedJobService.getJobStatus).toHaveBeenCalledWith("job-pdf-quote-1");
    });

    expect(await screen.findByRole("link", { name: /open pdf/i })).toHaveAttribute(
      "href",
      "/api/quotes/quote-1/pdf",
    );
  });

  it("resumes a pending PDF job on mount and refreshes the quote to failed", async () => {
    mockedJobService.getJobStatus.mockResolvedValueOnce({
      id: "job-pdf-quote-1",
      user_id: "user-1",
      document_id: "quote-1",
      document_revision: 0,
      job_type: "pdf",
      status: "terminal",
      attempts: 1,
      terminal_error: "render_failed",
      extraction_result: null,
      quote_id: null,
      created_at: "2026-03-20T00:00:00.000Z",
      updated_at: "2026-03-20T00:01:00.000Z",
    });
    mockedQuoteService.getQuote
      .mockResolvedValueOnce(
        makeQuoteDetail({
          customer_email: "customer@example.com",
          pdf_artifact: makePdfArtifact({ status: "pending", job_id: "job-pdf-quote-1" }),
        }),
      )
      .mockResolvedValueOnce(
        makeQuoteDetail({
          customer_email: "customer@example.com",
          pdf_artifact: makePdfArtifact({
            status: "failed",
            job_id: "job-pdf-quote-1",
            terminal_error: "render_failed",
          }),
        }),
      );

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });

    await waitFor(() => {
      expect(mockedJobService.getJobStatus).toHaveBeenCalledWith("job-pdf-quote-1");
    });

    expect(await screen.findByText("Quote PDF failed. Please try again.")).toBeInTheDocument();
  });

  it("shows an error when PDF generation fails", async () => {
    mockedQuoteService.generatePdf.mockRejectedValueOnce(
      new Error("Unable to render quote PDF"),
    );

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    fireEvent.click(screen.getByRole("button", { name: /generate pdf/i }));

    await waitFor(() => {
      expect(mockedQuoteService.generatePdf).toHaveBeenCalledWith("quote-1");
    });
    expect(await screen.findByText("Unable to render quote PDF")).toBeInTheDocument();
  });

  it("shows loading feedback while generating a PDF and clears it after failure", async () => {
    let rejectGeneratePdf: ((reason?: unknown) => void) | undefined;
    mockedQuoteService.generatePdf.mockReturnValueOnce(
      new Promise<JobStatusResponse>((_, reject) => {
        rejectGeneratePdf = reject;
      }),
    );

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    fireEvent.click(screen.getByRole("button", { name: /generate pdf/i }));

    expect(screen.getByRole("status")).toHaveTextContent("Generating PDF preview. This can take a few moments.");

    await act(async () => {
      rejectGeneratePdf?.(new Error("Unable to render quote PDF"));
      await Promise.resolve();
    });

    expect(await screen.findByText("Unable to render quote PDF")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("Generating PDF preview. This can take a few moments.")).not.toBeInTheDocument();
    });
  });

  it("preserves existing customer detail fields when email send response omits them", async () => {
    mockedQuoteService.getQuote
      .mockResolvedValueOnce(
        makeQuoteDetail({
          status: "ready",
          customer_name: "Preserved Customer",
          customer_email: "preserved@example.com",
          customer_phone: "+1-555-0199",
        }),
      )
      .mockResolvedValueOnce(
        makeQuoteDetail({
          status: "shared",
          shared_at: "2026-03-20T02:00:00.000Z",
          share_token: "share-token-2",
          customer_name: "Preserved Customer",
          customer_email: null,
          customer_phone: "+1-555-0199",
        }),
      )
      .mockResolvedValueOnce(
        makeQuoteDetail({
          status: "shared",
          shared_at: "2026-03-20T02:00:00.000Z",
          share_token: "share-token-2",
          customer_name: "Preserved Customer",
          customer_email: null,
          customer_phone: "+1-555-0199",
        }),
      );
    mockedQuoteService.sendQuoteEmail.mockResolvedValueOnce({
      id: "job-email-quote-1",
      user_id: "user-1",
      document_id: "quote-1",
      document_revision: null,
      job_type: "email",
      status: "pending",
      attempts: 0,
      terminal_error: null,
      extraction_result: null,
      quote_id: null,
      created_at: "2026-03-20T00:00:00.000Z",
      updated_at: "2026-03-20T00:00:00.000Z",
    });

    renderScreen();

    await screen.findByRole("heading", { name: "Preserved Customer" });
    fireEvent.click(
      within(screen.getByRole("group", { name: /quote utilities/i })).getByRole("button", {
        name: /send email/i,
      }),
    );

    const dialog = screen.getByRole("dialog", { name: /send email\?/i });
    expect(mockedQuoteService.sendQuoteEmail).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: /send email/i }));

    await waitFor(() => {
      expect(mockedQuoteService.sendQuoteEmail).toHaveBeenCalledWith("quote-1");
    });
    expect(await screen.findAllByText("Preserved Customer")).toHaveLength(2);
    expect(screen.getByText(/\+1-555-0199/i)).toBeInTheDocument();
    expect(screen.queryByText(/preserved@example.com/i)).not.toBeInTheDocument();
  });

  it("copies the share link from ready state without requiring prior local PDF generation", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      writable: true,
      value: { writeText: writeTextMock },
    });
    mockedQuoteService.getQuote.mockResolvedValueOnce(
      makeQuoteDetail({ status: "ready", customer_email: "customer@example.com" }),
    );

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

    await waitFor(() => {
      expect(mockedQuoteService.shareQuote).toHaveBeenCalledWith("quote-1");
      expect(writeTextMock).toHaveBeenCalledWith(
        "http://localhost:3000/doc/share-token-1",
      );
    });
    expect(await screen.findByText(/copied to clipboard/i)).toBeInTheDocument();
  });

  it("uses the Web Share API when available instead of the clipboard", async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, "share");
    Object.defineProperty(navigator, "share", {
      configurable: true,
      writable: true,
      value: shareMock,
    });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      writable: true,
      value: { writeText: writeTextMock },
    });
    mockedQuoteService.getQuote.mockResolvedValueOnce(
      makeQuoteDetail({ status: "ready", customer_email: "customer@example.com" }),
    );

    try {
      renderScreen();

      await screen.findByRole("heading", { name: "Test Customer" });
      fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

      await waitFor(() => {
        expect(mockedQuoteService.shareQuote).toHaveBeenCalledWith("quote-1");
        expect(shareMock).toHaveBeenCalledWith({
          title: "Quote Q-001",
          url: "http://localhost:3000/doc/share-token-1",
        });
      });
      expect(writeTextMock).not.toHaveBeenCalled();
      expect(await screen.findByText("Quote link shared.")).toBeInTheDocument();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(navigator, "share", originalDescriptor);
      } else {
        Reflect.deleteProperty(navigator, "share");
      }
    }
  });

  it("suppresses feedback when Web Share is aborted by the user", async () => {
    const abortError = new Error("Share aborted");
    abortError.name = "AbortError";
    const shareMock = vi.fn().mockRejectedValue(abortError);
    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, "share");
    Object.defineProperty(navigator, "share", {
      configurable: true,
      writable: true,
      value: shareMock,
    });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      writable: true,
      value: { writeText: writeTextMock },
    });
    mockedQuoteService.getQuote.mockResolvedValueOnce(
      makeQuoteDetail({ status: "ready", customer_email: "customer@example.com" }),
    );

    try {
      renderScreen();

      await screen.findByRole("heading", { name: "Test Customer" });
      fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

      await waitFor(() => {
        expect(shareMock).toHaveBeenCalledWith({
          title: "Quote Q-001",
          url: "http://localhost:3000/doc/share-token-1",
        });
      });

      expect(writeTextMock).not.toHaveBeenCalled();
      expect(screen.queryByText("Quote link shared.")).not.toBeInTheDocument();
      expect(screen.queryByText("Share link copied to clipboard.")).not.toBeInTheDocument();
      expect(screen.queryByText("Share aborted")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /copy link/i })).toBeEnabled();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(navigator, "share", originalDescriptor);
      } else {
        Reflect.deleteProperty(navigator, "share");
      }
    }
  });

  it("shows loading feedback while copying the share link and clears it after the request resolves", async () => {
    let resolveShareQuote: ((value: Quote) => void) | undefined;
    mockedQuoteService.getQuote.mockResolvedValueOnce(
      makeQuoteDetail({ status: "ready", customer_email: "customer@example.com" }),
    );
    mockedQuoteService.shareQuote.mockReturnValueOnce(
      new Promise<Quote>((resolve) => {
        resolveShareQuote = resolve;
      }),
    );

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

    expect(screen.getByRole("status")).toHaveTextContent("Copying share link...");

    await act(async () => {
      resolveShareQuote?.(makeQuoteResponse());
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByText("Copying share link...")).not.toBeInTheDocument();
    });
  });

  it("copies the existing share URL inline for shared quotes", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      writable: true,
      value: { writeText: writeTextMock },
    });
    mockedQuoteService.getQuote.mockResolvedValue(
      makeQuoteDetail({ status: "shared", share_token: "already-shared-token" }),
    );

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(
        "http://localhost:3000/doc/already-shared-token",
      );
    });
    expect(await screen.findByText("Share link copied to clipboard.")).toBeInTheDocument();
  });

  it("shows manual-copy guidance when clipboard API is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    mockedQuoteService.getQuote.mockResolvedValue(
      makeQuoteDetail({ status: "shared", share_token: "already-shared-token" }),
    );

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

    expect(await screen.findByLabelText("Share URL")).toHaveValue(
      "http://localhost:3000/doc/already-shared-token",
    );
    expect(await screen.findByText("Copy this share link manually.")).toBeInTheDocument();
  });

  it("shows an error when clipboard write fails", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      writable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("Clipboard denied")),
      },
    });
    mockedQuoteService.getQuote.mockResolvedValue(
      makeQuoteDetail({ status: "shared", share_token: "already-shared-token" }),
    );

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

    expect(await screen.findByText("Clipboard denied")).toBeInTheDocument();
  });

  it("requires confirmation before sending quote email", async () => {
    mockedQuoteService.getQuote
      .mockResolvedValueOnce(
        makeQuoteDetail({ status: "ready", customer_email: "customer@example.com" }),
      )
      .mockResolvedValueOnce(
        makeQuoteDetail({
          status: "shared",
          customer_email: "customer@example.com",
          share_token: "share-token-1",
        }),
      )
      .mockResolvedValueOnce(
        makeQuoteDetail({
          status: "shared",
          customer_email: "customer@example.com",
          share_token: "share-token-1",
        }),
      );

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    fireEvent.click(
      within(screen.getByRole("group", { name: /quote utilities/i })).getByRole("button", {
        name: /send email/i,
      }),
    );

    const dialog = screen.getByRole("dialog", { name: /send email\?/i });
    expect(within(dialog).getByText(/customer@example\.com/i)).toBeInTheDocument();
    expect(mockedQuoteService.sendQuoteEmail).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: /send email/i }));

    await waitFor(() => {
      expect(mockedQuoteService.sendQuoteEmail).toHaveBeenCalledWith("quote-1");
    });
    expect(await screen.findByText("Quote email sent.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resend email/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/quote status/i)).not.toBeInTheDocument();
  });

  it("disables send email and shows help text when the customer email is missing", async () => {
    mockedQuoteService.getQuote.mockResolvedValueOnce(makeQuoteDetail({ status: "ready" }));

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    expect(screen.getByRole("button", { name: /send email/i })).toBeDisabled();
    expect(screen.getByText(/add a customer email to send this quote via email/i)).toBeInTheDocument();
  });

  it.each([
    {
      status: 429,
      detail: "provider failure",
      expectedMessage: "This quote was emailed recently. Please wait a few minutes before resending.",
    },
    {
      status: 503,
      detail: "Unable to start email delivery right now. Please try again.",
      expectedMessage: "Unable to start email delivery right now. Please try again.",
    },
  ])("maps send-email API errors to user-friendly inline messages ($status)", async ({
    status,
    detail,
    expectedMessage,
  }) => {
    mockedQuoteService.getQuote.mockResolvedValueOnce(
      makeQuoteDetail({ status: "ready", customer_email: "customer@example.com" }),
    );
    mockedQuoteService.sendQuoteEmail.mockRejectedValueOnce(
      new HttpRequestError(detail, status, { detail }),
    );

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    fireEvent.click(
      within(screen.getByRole("group", { name: /quote utilities/i })).getByRole("button", {
        name: /send email/i,
      }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog", { name: /send email\?/i })).getByRole("button", {
        name: /send email/i,
      }),
    );

    expect(await screen.findByText(expectedMessage)).toBeInTheDocument();
  });

  it("shows a confirmation modal and deletes the quote before navigating home", async () => {
    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    await openOverflowMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /delete quote/i }));

    const dialog = screen.getByRole("dialog", { name: /delete q-001\?/i });
    expect(within(dialog).getByText("This cannot be undone.")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(mockedQuoteService.deleteQuote).toHaveBeenCalledWith("quote-1");
    });
    expect(await screen.findByText("Quote List Screen")).toBeInTheDocument();
  });

  it("closes the delete confirmation modal without deleting when kept", async () => {
    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    await openOverflowMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /delete quote/i }));

    const dialog = screen.getByRole("dialog", { name: /delete q-001\?/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /^keep$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /delete q-001\?/i })).not.toBeInTheDocument();
    });
    expect(mockedQuoteService.deleteQuote).not.toHaveBeenCalled();
    expect(screen.queryByText("Quote List Screen")).not.toBeInTheDocument();
  });

  it("shows an inline error when deleting the quote fails", async () => {
    mockedQuoteService.deleteQuote.mockRejectedValueOnce(new Error("Unable to delete quote"));

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    await openOverflowMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /delete quote/i }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: /delete q-001\?/i })).getByRole("button", {
        name: /^delete$/i,
      }),
    );

    await waitFor(() => {
      expect(mockedQuoteService.deleteQuote).toHaveBeenCalledWith("quote-1");
    });
    expect(await screen.findByText("Unable to delete quote")).toBeInTheDocument();
    expect(screen.queryByText("Quote List Screen")).not.toBeInTheDocument();
  });

  it("falls back to the quote list when back navigation has no browser history", async () => {
    window.history.replaceState({ idx: 0 }, "");
    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    expect(await screen.findByText("Quote List Screen")).toBeInTheDocument();
  });

  it("uses browser history back when a prior entry exists", async () => {
    window.history.replaceState({ idx: 1 }, "");
    renderScreen("/quotes/quote-1/preview", {
      initialEntries: ["/", "/quotes/quote-1/preview"],
      initialIndex: 1,
    });

    await screen.findByRole("heading", { name: "Test Customer" });
    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    expect(await screen.findByText("Quote List Screen")).toBeInTheDocument();
  });

  it("keeps send email hidden for draft quotes even when a customer email exists", async () => {
    mockedQuoteService.getQuote.mockResolvedValueOnce(
      makeQuoteDetail({ customer_email: "customer@example.com" }),
    );

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    expect(screen.getByRole("button", { name: /generate pdf/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send email/i })).not.toBeInTheDocument();
  });
});
