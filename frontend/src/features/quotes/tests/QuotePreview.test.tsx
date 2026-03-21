import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QuotePreview } from "@/features/quotes/components/QuotePreview";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { Quote } from "@/features/quotes/types/quote.types";

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

const mockedQuoteService = vi.mocked(quoteService);
const createObjectUrlMock = vi.fn();
const revokeObjectUrlMock = vi.fn();

function makeQuote(overrides: Partial<Quote> = {}): Quote {
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
  it("fetches quote on mount and renders summary", async () => {
    renderScreen();

    await waitFor(() => {
      expect(mockedQuoteService.getQuote).toHaveBeenCalledWith("quote-1");
    });

    expect(await screen.findByText(/Q-001/i)).toBeInTheDocument();
    expect(screen.getByText(/Status:/i)).toHaveTextContent("draft");
  });

  it("shows an error when quote fetch fails", async () => {
    mockedQuoteService.getQuote.mockRejectedValueOnce(new Error("Unable to load quote"));

    renderScreen();

    expect(await screen.findByText("Unable to load quote")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate pdf/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^share$/i })).toBeDisabled();
  });

  it("generates PDF and renders iframe preview", async () => {
    renderScreen();

    await screen.findByText(/Q-001/i);
    fireEvent.click(screen.getByRole("button", { name: /generate pdf/i }));

    await waitFor(() => {
      expect(mockedQuoteService.generatePdf).toHaveBeenCalledWith("quote-1");
      expect(createObjectUrlMock).toHaveBeenCalledTimes(1);
    });

    const frame = screen.getByTitle("Quote PDF Preview") as HTMLIFrameElement;
    expect(frame.src).toContain("blob:quote-preview");
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
    expect(screen.queryByTitle("Quote PDF Preview")).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /^share$/i }));

    await waitFor(() => {
      expect(mockedQuoteService.shareQuote).toHaveBeenCalledWith("quote-1");
    });
    expect(await screen.findByText("Unable to share quote")).toBeInTheDocument();
    expect(screen.queryByText(/Share URL:/i)).not.toBeInTheDocument();
  });
});
