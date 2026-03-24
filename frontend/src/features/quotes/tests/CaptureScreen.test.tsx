import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CaptureScreen } from "@/features/quotes/components/CaptureScreen";
import { useQuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";
import { useVoiceCapture, type VoiceClip } from "@/features/quotes/hooks/useVoiceCapture";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { ExtractionResult } from "@/features/quotes/types/quote.types";

const navigateMock = vi.fn();
const setDraftMock = vi.fn();
const useParamsMock = vi.fn(() => ({ customerId: "cust-1" }));

const startRecordingMock = vi.fn(async () => undefined);
const stopRecordingMock = vi.fn();
const removeClipMock = vi.fn();
const clearVoiceErrorMock = vi.fn();

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

vi.mock("@/features/quotes/hooks/useVoiceCapture", () => ({
  useVoiceCapture: vi.fn(),
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
const mockedUseVoiceCapture = vi.mocked(useVoiceCapture);
const mockedQuoteService = vi.mocked(quoteService);

const extractionFixture: ExtractionResult = {
  transcript: "5 yards brown mulch",
  line_items: [
    {
      description: "Brown mulch",
      details: "5 yards",
      price: 120,
      flagged: true,
      flag_reason: "Unit phrasing may be ambiguous",
    },
  ],
  total: 120,
  confidence_notes: [],
};

const clipFixture: VoiceClip = {
  id: "clip-1",
  blob: new Blob(["clip-1"], { type: "audio/webm" }),
  url: "blob:clip-1",
  durationSeconds: 4,
};

function mockVoiceCapture(overrides: Partial<ReturnType<typeof useVoiceCapture>> = {}): void {
  mockedUseVoiceCapture.mockReturnValue({
    clips: [],
    elapsedSeconds: 0,
    error: null,
    isRecording: false,
    isSupported: true,
    startRecording: startRecordingMock,
    stopRecording: stopRecordingMock,
    removeClip: removeClipMock,
    clearClips: vi.fn(),
    clearError: clearVoiceErrorMock,
    ...overrides,
  });
}

function renderScreen() {
  return render(
    <MemoryRouter>
      <CaptureScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockedUseQuoteDraft.mockReturnValue({
    draft: null,
    setDraft: setDraftMock,
    updateLineItem: vi.fn(),
    removeLineItem: vi.fn(),
    clearDraft: vi.fn(),
  });
  mockVoiceCapture();
  mockedQuoteService.extract.mockResolvedValue(extractionFixture);
  useParamsMock.mockReturnValue({ customerId: "cust-1" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("CaptureScreen", () => {
  it("renders both recorded clips and written description sections with no mode toggle", () => {
    renderScreen();

    expect(screen.getByText("RECORDED CLIPS")).toBeInTheDocument();
    expect(screen.getByText("WRITTEN DESCRIPTION")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Voice" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Text" })).not.toBeInTheDocument();
  });

  it("keeps extract button disabled when there are no clips and notes are empty", () => {
    renderScreen();

    expect(screen.getByRole("button", { name: /extract line items/i })).toBeDisabled();
  });

  it("enables extract button when notes are present", () => {
    renderScreen();

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "Install sod in backyard" },
    });

    expect(screen.getByRole("button", { name: /extract line items/i })).toBeEnabled();
  });

  it("enables extract button when at least one clip exists", () => {
    mockVoiceCapture({ clips: [clipFixture] });
    renderScreen();

    expect(screen.getByRole("button", { name: /extract line items/i })).toBeEnabled();
  });

  it("shows recording state with stop button and elapsed time", () => {
    mockVoiceCapture({ isRecording: true, elapsedSeconds: 3 });
    renderScreen();

    expect(screen.getByText("Recording... 00:03")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /stop/i })).toBeInTheDocument();
  });

  it("shows browser unsupported warning", () => {
    mockVoiceCapture({ isSupported: false });
    renderScreen();

    expect(
      screen.getByText(
        "Voice capture is not supported in this browser. You can still type notes and extract line items.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a leave confirmation when navigating back with unsaved clips", () => {
    mockVoiceCapture({ clips: [clipFixture] });
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: /go back/i }));

    expect(screen.getByRole("dialog", { name: "Leave this screen?" })).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalledWith(-1);
  });

  it("shows a leave confirmation when navigating back with unsaved notes", () => {
    renderScreen();

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "Install sod in backyard" },
    });
    fireEvent.click(screen.getByRole("button", { name: /go back/i }));

    expect(screen.getByRole("dialog", { name: "Leave this screen?" })).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalledWith(-1);
  });

  it("navigates back immediately when there is no unsaved work", () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: /go back/i }));

    expect(navigateMock).toHaveBeenCalledWith(-1);
    expect(screen.queryByRole("dialog", { name: "Leave this screen?" })).not.toBeInTheDocument();
  });

  it("dismisses the leave confirmation when Stay is clicked", () => {
    renderScreen();

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "Install sod in backyard" },
    });
    fireEvent.click(screen.getByRole("button", { name: /go back/i }));
    fireEvent.click(screen.getByRole("button", { name: "Stay" }));

    expect(screen.queryByRole("dialog", { name: "Leave this screen?" })).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalledWith(-1);
  });

  it("navigates back after confirming Leave", () => {
    renderScreen();

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "Install sod in backyard" },
    });
    fireEvent.click(screen.getByRole("button", { name: /go back/i }));
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));

    expect(navigateMock).toHaveBeenCalledWith(-1);
  });

  it("submits combined extraction payload and writes voice draft when clips are present", async () => {
    mockVoiceCapture({ clips: [clipFixture] });
    renderScreen();

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "  add travel surcharge  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /extract line items/i }));

    await waitFor(() => {
      expect(mockedQuoteService.extract).toHaveBeenCalledWith({
        clips: [clipFixture.blob],
        notes: "  add travel surcharge  ",
      });
    });
    expect(setDraftMock).toHaveBeenCalledWith({
      customerId: "cust-1",
      transcript: "5 yards brown mulch",
      lineItems: [
        {
          description: "Brown mulch",
          details: "5 yards",
          price: 120,
          flagged: true,
          flagReason: "Unit phrasing may be ambiguous",
        },
      ],
      total: 120,
      confidenceNotes: [],
      notes: "",
      sourceType: "voice",
    });
    expect(navigateMock).toHaveBeenCalledWith("/quotes/review");
  });

  it("writes text sourceType when extracting with notes only", async () => {
    renderScreen();

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "Install sod in backyard" },
    });
    fireEvent.click(screen.getByRole("button", { name: /extract line items/i }));

    await waitFor(() => {
      expect(setDraftMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: "text",
        }),
      );
    });
  });

  it("shows inline error and does not navigate when extraction fails", async () => {
    mockedQuoteService.extract.mockRejectedValueOnce(new Error("Extraction failed"));
    renderScreen();

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "Install sod in backyard" },
    });
    fireEvent.click(screen.getByRole("button", { name: /extract line items/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Extraction failed");
    expect(navigateMock).not.toHaveBeenCalledWith("/quotes/review");
  });

  it("shows staged extraction progress and clears it after extraction resolves", async () => {
    vi.useFakeTimers();

    let resolveExtraction: ((value: ExtractionResult) => void) | undefined;
    mockedQuoteService.extract.mockReturnValueOnce(
      new Promise<ExtractionResult>((resolve) => {
        resolveExtraction = resolve;
      }),
    );

    renderScreen();

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "Install sod in backyard" },
    });
    fireEvent.click(screen.getByRole("button", { name: /extract line items/i }));

    expect(screen.getByText("Analyzing notes...")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByText("Extracting line items...")).toBeInTheDocument();

    await act(async () => {
      resolveExtraction?.(extractionFixture);
      await Promise.resolve();
    });

    expect(screen.queryByText("Extracting line items...")).not.toBeInTheDocument();
  });

  it("does not apply the draft or redirect to review after leaving during in-flight extraction", async () => {
    let resolveExtraction: ((value: ExtractionResult) => void) | undefined;
    mockedQuoteService.extract.mockReturnValueOnce(
      new Promise<ExtractionResult>((resolve) => {
        resolveExtraction = resolve;
      }),
    );

    const view = renderScreen();

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "Install sod in backyard" },
    });
    fireEvent.click(screen.getByRole("button", { name: /extract line items/i }));
    fireEvent.click(screen.getByRole("button", { name: /go back/i }));
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));

    expect(navigateMock).toHaveBeenCalledWith(-1);

    view.unmount();

    await act(async () => {
      resolveExtraction?.(extractionFixture);
      await Promise.resolve();
    });

    expect(setDraftMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalledWith("/quotes/review");
  });
});
