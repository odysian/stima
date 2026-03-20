import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CaptureScreen } from "@/features/quotes/components/CaptureScreen";
import { useQuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { ExtractionResult } from "@/features/quotes/types/quote.types";

const navigateMock = vi.fn();
const setDraftMock = vi.fn();
const clearDraftMock = vi.fn();
const useParamsMock = vi.fn(() => ({ customerId: "cust-1" }));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => useParamsMock(),
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

function renderScreen(): void {
  render(
    <MemoryRouter>
      <CaptureScreen />
    </MemoryRouter>,
  );
}

const extractionFixture: ExtractionResult = {
  transcript: "5 yards brown mulch",
  line_items: [{ description: "Brown mulch", details: "5 yards", price: 120 }],
  total: 120,
  confidence_notes: [],
};

beforeEach(() => {
  mockedUseQuoteDraft.mockReturnValue({
    draft: null,
    setDraft: setDraftMock,
    clearDraft: clearDraftMock,
  });
  mockedQuoteService.convertNotes.mockResolvedValue(extractionFixture);
  useParamsMock.mockReturnValue({ customerId: "cust-1" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("CaptureScreen", () => {
  it("renders notes textarea and Generate Draft button", () => {
    renderScreen();

    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate draft/i })).toBeInTheDocument();
  });

  it("keeps Generate Draft disabled when notes are empty", () => {
    renderScreen();

    expect(screen.getByRole("button", { name: /generate draft/i })).toBeDisabled();
  });

  it("enables Generate Draft when textarea has content", () => {
    renderScreen();

    fireEvent.change(screen.getByLabelText(/notes/i), {
      target: { value: "Install sod in backyard" },
    });

    expect(screen.getByRole("button", { name: /generate draft/i })).toBeEnabled();
  });

  it("shows loading state text while extraction call is in flight", async () => {
    let resolveExtraction: ((value: ExtractionResult) => void) | undefined;
    mockedQuoteService.convertNotes.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveExtraction = resolve;
        }),
    );

    renderScreen();
    fireEvent.change(screen.getByLabelText(/notes/i), {
      target: { value: "Install sod in backyard" },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate draft/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("Extracting line items...");

    resolveExtraction?.(extractionFixture);
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/quotes/review"));
  });

  it("sets draft and navigates to review after successful extraction", async () => {
    renderScreen();
    fireEvent.change(screen.getByLabelText(/notes/i), {
      target: { value: "Install sod in backyard" },
    });

    fireEvent.click(screen.getByRole("button", { name: /generate draft/i }));

    await waitFor(() => {
      expect(mockedQuoteService.convertNotes).toHaveBeenCalledWith("Install sod in backyard");
    });
    expect(setDraftMock).toHaveBeenCalledWith({
      customerId: "cust-1",
      transcript: "5 yards brown mulch",
      lineItems: [{ description: "Brown mulch", details: "5 yards", price: 120 }],
      total: 120,
      confidenceNotes: [],
      notes: "",
    });
    expect(navigateMock).toHaveBeenCalledWith("/quotes/review");
  });

  it("shows inline error message when extraction fails", async () => {
    mockedQuoteService.convertNotes.mockRejectedValueOnce(new Error("Extraction failed"));

    renderScreen();
    fireEvent.change(screen.getByLabelText(/notes/i), {
      target: { value: "Install sod in backyard" },
    });

    fireEvent.click(screen.getByRole("button", { name: /generate draft/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Extraction failed");
    expect(navigateMock).not.toHaveBeenCalledWith("/quotes/review");
  });
});
