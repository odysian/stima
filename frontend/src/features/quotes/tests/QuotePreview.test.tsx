import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QuotePreview } from "@/features/quotes/components/QuotePreview";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { Quote } from "@/features/quotes/types/quote.types";

vi.mock("@/features/quotes/services/quoteService", () => ({
  quoteService: {
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
const createObjectUrlMock = vi.fn();
const revokeObjectUrlMock = vi.fn();

type QuotePreviewTestQuote = Quote & {
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
};

function makeQuote(overrides: Partial<QuotePreviewTestQuote> = {}): QuotePreviewTestQuote {
  return {
    id: "quote-1",
    customer_id: "cust-1",
    doc_number: "Q-001",
    status: "draft",
    source_type: "text",
    transcript: "5 yards brown mulch",
    total_amount: 120,
    notes: "Thanks for your business",
    shared_at: null,
    share_token: null,
    customer_name: "Alice Johnson",
    customer_email: "alice@example.com",
    customer_phone: "555-0101",
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

function renderScreen(path = "/quotes/quote-1/preview"): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/quotes/:id/preview" element={<QuotePreview />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockedQuoteService.getQuote.mockResolvedValue(makeQuote());
  mockedQuoteService.generatePdf.mockResolvedValue(
    new Blob(["pdf-binary"], { type: "application/pdf" }),
  );
  mockedQuoteService.shareQuote.mockResolvedValue(
    makeQuote({
      status: "shared",
      shared_at: "2026-03-20T01:00:00.000Z",
      share_token: "share-token-1",
    }),
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
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("QuotePreview", () => {
  it("fetches quote on mount and renders the header, placeholder, and nav", async () => {
    renderScreen();

    await waitFor(() => {
      expect(mockedQuoteService.getQuote).toHaveBeenCalledWith("quote-1");
    });

    expect(await screen.findByRole("heading", { name: "Q-001" })).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Generate the PDF to preview it here.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^share$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /quotes/i })).toHaveClass("text-primary");
  });

  it("shows an error when quote fetch fails", async () => {
    mockedQuoteService.getQuote.mockRejectedValueOnce(new Error("Unable to load quote"));

    renderScreen();

    expect(await screen.findByText("Unable to load quote")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate pdf/i })).not.toBeInTheDocument();
  });

  it("renders amount and client cards from quote data", async () => {
    mockedQuoteService.getQuote.mockResolvedValueOnce(
      makeQuote({
        total_amount: 245.5,
        customer_name: "Morgan Lee",
        customer_email: "morgan@example.com",
      }),
    );

    renderScreen();

    expect(await screen.findByText("$245.50")).toBeInTheDocument();
    expect(screen.getByText("Morgan Lee")).toBeInTheDocument();
  });

  it("generates PDF and renders iframe preview", async () => {
    renderScreen();

    await screen.findByText(/Q-001/i);
    fireEvent.click(screen.getByRole("button", { name: /generate pdf/i }));

    await waitFor(() => {
      expect(mockedQuoteService.generatePdf).toHaveBeenCalledWith("quote-1");
      expect(createObjectUrlMock).toHaveBeenCalledTimes(1);
    });

    const frame = screen.getByTitle("Quote PDF preview") as HTMLIFrameElement;
    expect(frame.src).toContain("blob:quote-preview");
    expect(screen.getByRole("button", { name: /^share$/i })).toBeEnabled();
  });

  it("shows an error when PDF generation fails", async () => {
    mockedQuoteService.generatePdf.mockRejectedValueOnce(
      new Error("Unable to render quote PDF"),
    );

    renderScreen();

    await screen.findByText(/Q-001/i);
    fireEvent.click(screen.getByRole("button", { name: /generate pdf/i }));

    await waitFor(() => {
      expect(mockedQuoteService.generatePdf).toHaveBeenCalledWith("quote-1");
    });
    expect(await screen.findByText("Unable to render quote PDF")).toBeInTheDocument();
    expect(screen.queryByTitle("Quote PDF preview")).not.toBeInTheDocument();
  });

  it("uses navigator.share when available", async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      writable: true,
      value: shareMock,
    });
    mockedQuoteService.getQuote.mockResolvedValueOnce(makeQuote({ status: "ready" }));

    renderScreen();

    await screen.findByText(/Q-001/i);
    fireEvent.click(screen.getByRole("button", { name: /generate pdf/i }));
    await waitFor(() => {
      expect(mockedQuoteService.generatePdf).toHaveBeenCalledWith("quote-1");
    });
    fireEvent.click(screen.getByRole("button", { name: /^share$/i }));

    await waitFor(() => {
      expect(mockedQuoteService.shareQuote).toHaveBeenCalledWith("quote-1");
      expect(shareMock).toHaveBeenCalledWith({
        title: "Quote Q-001",
        url: "http://localhost:3000/share/share-token-1",
      });
    });
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
    mockedQuoteService.getQuote.mockResolvedValueOnce(makeQuote({ status: "ready" }));

    renderScreen();

    await screen.findByText(/Q-001/i);
    fireEvent.click(screen.getByRole("button", { name: /generate pdf/i }));
    await waitFor(() => {
      expect(mockedQuoteService.generatePdf).toHaveBeenCalledWith("quote-1");
    });
    fireEvent.click(screen.getByRole("button", { name: /^share$/i }));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(
        "http://localhost:3000/share/share-token-1",
      );
    });
    expect(await screen.findByText(/copied to clipboard/i)).toBeInTheDocument();
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
    mockedQuoteService.getQuote.mockResolvedValueOnce(makeQuote({ status: "ready" }));

    renderScreen();

    await screen.findByText(/Q-001/i);
    fireEvent.click(screen.getByRole("button", { name: /generate pdf/i }));
    await waitFor(() => {
      expect(mockedQuoteService.generatePdf).toHaveBeenCalledWith("quote-1");
    });
    fireEvent.click(screen.getByRole("button", { name: /^share$/i }));

    await waitFor(() => {
      expect(mockedQuoteService.shareQuote).toHaveBeenCalledWith("quote-1");
    });
    expect(screen.queryByText("Share canceled")).not.toBeInTheDocument();
    expect(await screen.findByText(/share\/share-token-1/i)).toBeInTheDocument();
  });

  it("shows an error when share request fails", async () => {
    mockedQuoteService.getQuote.mockResolvedValueOnce(makeQuote({ status: "ready" }));
    mockedQuoteService.shareQuote.mockRejectedValueOnce(new Error("Unable to share quote"));

    renderScreen();

    await screen.findByText(/Q-001/i);
    fireEvent.click(screen.getByRole("button", { name: /generate pdf/i }));
    await waitFor(() => {
      expect(mockedQuoteService.generatePdf).toHaveBeenCalledWith("quote-1");
    });
    fireEvent.click(screen.getByRole("button", { name: /^share$/i }));

    await waitFor(() => {
      expect(mockedQuoteService.shareQuote).toHaveBeenCalledWith("quote-1");
    });
    expect(await screen.findByText("Unable to share quote")).toBeInTheDocument();
    expect(screen.queryByText(/share\/share-token-1/i)).not.toBeInTheDocument();
  });
});
