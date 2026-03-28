import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QuotePreview } from "@/features/quotes/components/QuotePreview";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { Quote, QuoteDetail } from "@/features/quotes/types/quote.types";

vi.mock("@/features/quotes/services/quoteService", () => ({
  quoteService: {
    convertNotes: vi.fn(),
    captureAudio: vi.fn(),
    createQuote: vi.fn(),
    listQuotes: vi.fn(),
    getQuote: vi.fn(),
    updateQuote: vi.fn(),
    deleteQuote: vi.fn(),
    generatePdf: vi.fn(),
    shareQuote: vi.fn(),
    markQuoteWon: vi.fn(),
    markQuoteLost: vi.fn(),
  },
}));

const mockedQuoteService = vi.mocked(quoteService);
const createObjectUrlMock = vi.fn();
const revokeObjectUrlMock = vi.fn();

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

function renderScreen(path = "/quotes/quote-1/preview"): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/quotes/:id/preview" element={<QuotePreview />} />
        <Route path="/quotes/:id/edit" element={<div>Edit Quote Screen</div>} />
        <Route path="/" element={<div>Quote List Screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function generatePdfAndWaitForShareEnabled(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: /generate pdf/i }));
  await waitFor(() => {
    expect(mockedQuoteService.generatePdf).toHaveBeenCalledWith("quote-1");
  });
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /share quote/i })).toBeEnabled();
  });
}

beforeEach(() => {
  mockedQuoteService.getQuote.mockResolvedValue(makeQuoteDetail());
  mockedQuoteService.generatePdf.mockResolvedValue(
    new Blob(["pdf-binary"], { type: "application/pdf" }),
  );
  mockedQuoteService.deleteQuote.mockResolvedValue(undefined);
  mockedQuoteService.shareQuote.mockResolvedValue(makeQuoteResponse());
  mockedQuoteService.markQuoteWon.mockResolvedValue(
    makeQuoteResponse({ status: "approved" }),
  );
  mockedQuoteService.markQuoteLost.mockResolvedValue(
    makeQuoteResponse({ status: "declined" }),
  );
  createObjectUrlMock.mockReturnValue("blob:quote-preview");
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: createObjectUrlMock,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: revokeObjectUrlMock,
  });
  Object.defineProperty(navigator, "share", {
    configurable: true,
    writable: true,
    value: undefined,
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    writable: true,
    value: undefined,
  });
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("QuotePreview", () => {
  it("fetches quote on mount, uses customer name as the header title, and renders the nav", async () => {
    renderScreen();

    await waitFor(() => {
      expect(mockedQuoteService.getQuote).toHaveBeenCalledWith("quote-1");
    });

    expect(await screen.findByRole("heading", { name: "Test Customer" })).toBeInTheDocument();
    expect(screen.getByText("Q-001")).toBeInTheDocument();
    expect(screen.getAllByText("Draft")).toHaveLength(1);
    expect(screen.queryByText("PDF not generated")).not.toBeInTheDocument();
    expect(screen.queryByText("Generate the quote PDF to open it or share it with your customer.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /share quote/i })).not.toBeInTheDocument();
    expect(screen.queryByTitle("Quote PDF preview")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit quote/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete quote/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /quotes/i })).toHaveClass("text-primary");
  });

  it("hides the edit button when the quote is shared", async () => {
    mockedQuoteService.getQuote.mockResolvedValueOnce(makeQuoteDetail({ status: "shared" }));

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    expect(screen.queryByRole("button", { name: /edit quote/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete quote/i })).not.toBeInTheDocument();
  });

  it.each(["viewed", "approved", "declined"] as const)(
    "hides edit and delete actions when the quote is %s",
    async (status) => {
      mockedQuoteService.getQuote.mockResolvedValueOnce(
        makeQuoteDetail({ status, share_token: "share-token-1" }),
      );

      renderScreen();

      await screen.findByRole("heading", { name: "Test Customer" });
      expect(screen.queryByRole("button", { name: /edit quote/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /delete quote/i })).not.toBeInTheDocument();
    },
  );

  it("shows the delete button when the quote is ready", async () => {
    mockedQuoteService.getQuote.mockResolvedValueOnce(makeQuoteDetail({ status: "ready" }));

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    expect(screen.getByText("PDF ready")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate pdf/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /share quote/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete quote/i })).toBeInTheDocument();
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

  it("falls back to the shared PDF link for shared quotes without a local blob", async () => {
    mockedQuoteService.getQuote.mockResolvedValueOnce(
      makeQuoteDetail({ status: "shared", share_token: "share-token-1" }),
    );

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    const openPdfLink = screen.getByRole("link", { name: /open pdf/i });
    expect(openPdfLink).toHaveAttribute(
      "href",
      "http://localhost:3000/share/share-token-1",
    );
    expect(screen.getByText("Copy Share Link")).toBeInTheDocument();
    expect(screen.getByText("http://localhost:3000/doc/share-token-1")).toBeInTheDocument();
  });

  it("keeps the raw PDF open link for viewed quotes without a local blob", async () => {
    mockedQuoteService.getQuote.mockResolvedValueOnce(
      makeQuoteDetail({ status: "viewed", share_token: "share-token-1" }),
    );

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    expect(screen.getByRole("link", { name: /open pdf/i })).toHaveAttribute(
      "href",
      "http://localhost:3000/share/share-token-1",
    );
    expect(screen.getByText("http://localhost:3000/doc/share-token-1")).toBeInTheDocument();
  });

  it("marks a shared quote as won and refetches the closed state", async () => {
    mockedQuoteService.getQuote
      .mockResolvedValueOnce(makeQuoteDetail({ status: "shared", share_token: "share-token-1" }))
      .mockResolvedValueOnce(
        makeQuoteDetail({ status: "approved", share_token: "share-token-1" }),
      );

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    fireEvent.click(screen.getByRole("button", { name: /mark as won/i }));

    await waitFor(() => {
      expect(mockedQuoteService.markQuoteWon).toHaveBeenCalledWith("quote-1");
    });
    await waitFor(() => {
      expect(mockedQuoteService.getQuote).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText("Quote approved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark as won/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark as lost/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/share\/share-token-1/i)).not.toBeInTheDocument();
  });

  it("shows the lost confirmation modal and refetches the declined state after confirmation", async () => {
    mockedQuoteService.getQuote
      .mockResolvedValueOnce(makeQuoteDetail({ status: "shared", share_token: "share-token-1" }))
      .mockResolvedValueOnce(
        makeQuoteDetail({ status: "declined", share_token: "share-token-1" }),
      );

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    fireEvent.click(screen.getByRole("button", { name: /mark as lost/i }));

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

    expect(await screen.findByText("Quote declined")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark as won/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark as lost/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/share\/share-token-1/i)).not.toBeInTheDocument();
  });

  it("navigates to the edit route from the preview action area", async () => {
    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    fireEvent.click(screen.getByRole("button", { name: /edit quote/i }));

    expect(await screen.findByText("Edit Quote Screen")).toBeInTheDocument();
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

  it("generates PDF and promotes open/share actions", async () => {
    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    fireEvent.click(screen.getByRole("button", { name: /generate pdf/i }));

    await waitFor(() => {
      expect(mockedQuoteService.generatePdf).toHaveBeenCalledWith("quote-1");
      expect(createObjectUrlMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByTitle("Quote PDF preview")).not.toBeInTheDocument();
    expect(screen.getByText("PDF ready")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /share quote/i })).toBeEnabled();
    expect(screen.getByRole("link", { name: /open pdf/i })).toHaveAttribute(
      "href",
      "blob:quote-preview",
    );
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
    expect(screen.queryByText("PDF not generated")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Quote PDF preview")).not.toBeInTheDocument();
  });

  it("shows loading feedback while generating a PDF and clears it after failure", async () => {
    let rejectGeneratePdf: ((reason?: unknown) => void) | undefined;
    mockedQuoteService.generatePdf.mockReturnValueOnce(
      new Promise<Blob>((_, reject) => {
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

  it("uses navigator.share when available", async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      writable: true,
      value: shareMock,
    });
    mockedQuoteService.getQuote.mockResolvedValueOnce(makeQuoteDetail({ status: "ready" }));

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    await generatePdfAndWaitForShareEnabled();
    fireEvent.click(screen.getByRole("button", { name: /share quote/i }));

    await waitFor(() => {
      expect(mockedQuoteService.shareQuote).toHaveBeenCalledWith("quote-1");
      expect(shareMock).toHaveBeenCalledWith({
        title: "Quote Q-001",
        url: "http://localhost:3000/doc/share-token-1",
      });
    });
  });

  it("preserves existing customer detail fields when share response omits them", async () => {
    mockedQuoteService.getQuote.mockResolvedValueOnce(
      makeQuoteDetail({
        status: "ready",
        customer_name: "Preserved Customer",
        customer_email: "preserved@example.com",
        customer_phone: "+1-555-0199",
      }),
    );
    mockedQuoteService.shareQuote.mockResolvedValueOnce(
      makeQuoteResponse({
        status: "shared",
        shared_at: "2026-03-20T02:00:00.000Z",
        share_token: "share-token-2",
      }),
    );

    renderScreen();

    await screen.findByRole("heading", { name: "Preserved Customer" });
    await generatePdfAndWaitForShareEnabled();
    fireEvent.click(screen.getByRole("button", { name: /share quote/i }));

    await waitFor(() => {
      expect(mockedQuoteService.shareQuote).toHaveBeenCalledWith("quote-1");
    });
    expect(await screen.findAllByText("Preserved Customer")).toHaveLength(2);
    expect(screen.getByText(/preserved@example.com/i)).toBeInTheDocument();
  });

  it("falls back to clipboard copy when share API is unavailable", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      writable: true,
      value: { writeText: writeTextMock },
    });
    mockedQuoteService.getQuote.mockResolvedValueOnce(makeQuoteDetail({ status: "ready" }));

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    await generatePdfAndWaitForShareEnabled();
    fireEvent.click(screen.getByRole("button", { name: /share quote/i }));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(
        "http://localhost:3000/doc/share-token-1",
      );
    });
    expect(await screen.findByText(/copied to clipboard/i)).toBeInTheDocument();
  });

  it("shows loading feedback while sharing and clears it after the share request resolves", async () => {
    let resolveShareQuote: ((value: Quote) => void) | undefined;
    mockedQuoteService.getQuote.mockResolvedValueOnce(makeQuoteDetail({ status: "ready" }));
    mockedQuoteService.shareQuote.mockReturnValueOnce(
      new Promise<Quote>((resolve) => {
        resolveShareQuote = resolve;
      }),
    );

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    await generatePdfAndWaitForShareEnabled();
    fireEvent.click(screen.getByRole("button", { name: /share quote/i }));

    expect(screen.getByRole("status")).toHaveTextContent("Preparing share link...");

    await act(async () => {
      resolveShareQuote?.(makeQuoteResponse());
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByText("Preparing share link...")).not.toBeInTheDocument();
    });
  });

  it("does not show an error when native share is dismissed", async () => {
    const shareAbortError = Object.assign(new Error("Share canceled"), {
      name: "AbortError",
    });
    const shareMock = vi.fn().mockRejectedValue(shareAbortError);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      writable: true,
      value: shareMock,
    });
    mockedQuoteService.getQuote.mockResolvedValueOnce(makeQuoteDetail({ status: "ready" }));

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    await generatePdfAndWaitForShareEnabled();
    fireEvent.click(screen.getByRole("button", { name: /share quote/i }));

    await waitFor(() => {
      expect(mockedQuoteService.shareQuote).toHaveBeenCalledWith("quote-1");
    });
    expect(screen.queryByText("Share canceled")).not.toBeInTheDocument();
    expect(screen.getByText("Quote shared")).toBeInTheDocument();
    expect(await screen.findByText(/doc\/share-token-1/i)).toBeInTheDocument();
  });

  it("copies existing share URL from the client card row", async () => {
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

    const shareLinkRow = (await screen.findByText(/doc\/already-shared-token/i)).closest("section");
    expect(shareLinkRow).not.toBeNull();
    fireEvent.click(within(shareLinkRow as HTMLElement).getByRole("button", { name: /copy share link/i }));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(
        "http://localhost:3000/doc/already-shared-token",
      );
    });
    expect(await screen.findByText("Share link copied to clipboard.")).toBeInTheDocument();
  });

  it("shows manual-copy guidance when clipboard API is unavailable", async () => {
    mockedQuoteService.getQuote.mockResolvedValue(
      makeQuoteDetail({ status: "shared", share_token: "already-shared-token" }),
    );

    renderScreen();

    const shareLinkRow = (await screen.findByText(/doc\/already-shared-token/i)).closest("section");
    expect(shareLinkRow).not.toBeNull();
    fireEvent.click(within(shareLinkRow as HTMLElement).getByRole("button", { name: /copy share link/i }));

    expect(await screen.findByText("Copy this share link manually.")).toBeInTheDocument();
  });

  it("shows an error when clipboard write fails from the share URL row", async () => {
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

    const shareLinkRow = (await screen.findByText(/doc\/already-shared-token/i)).closest("section");
    expect(shareLinkRow).not.toBeNull();
    fireEvent.click(within(shareLinkRow as HTMLElement).getByRole("button", { name: /copy share link/i }));

    expect(await screen.findByText("Clipboard denied")).toBeInTheDocument();
  });

  it("shows an error when share request fails", async () => {
    mockedQuoteService.getQuote.mockResolvedValueOnce(makeQuoteDetail({ status: "ready" }));
    mockedQuoteService.shareQuote.mockRejectedValueOnce(new Error("Unable to share quote"));

    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    await generatePdfAndWaitForShareEnabled();
    fireEvent.click(screen.getByRole("button", { name: /share quote/i }));

    await waitFor(() => {
      expect(mockedQuoteService.shareQuote).toHaveBeenCalledWith("quote-1");
    });
    expect(await screen.findByText("Unable to share quote")).toBeInTheDocument();
    expect(screen.queryByText(/share\/share-token-1/i)).not.toBeInTheDocument();
  });

  it("shows a confirmation modal and deletes the quote before navigating home", async () => {
    renderScreen();

    await screen.findByRole("heading", { name: "Test Customer" });
    fireEvent.click(screen.getByRole("button", { name: /delete quote/i }));

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
    fireEvent.click(screen.getByRole("button", { name: /delete quote/i }));

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
    fireEvent.click(screen.getByRole("button", { name: /delete quote/i }));
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
});
