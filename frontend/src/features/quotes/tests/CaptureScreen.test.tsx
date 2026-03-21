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
const clearDraftMock = vi.fn();
const useParamsMock = vi.fn(() => ({ customerId: "cust-1" }));

const startRecordingMock = vi.fn(async () => undefined);
const stopRecordingMock = vi.fn();
const removeClipMock = vi.fn();
const clearClipsMock = vi.fn();
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
    convertNotes: vi.fn(),
    captureAudio: vi.fn(),
    createQuote: vi.fn(),
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
    clearClips: clearClipsMock,
    clearError: clearVoiceErrorMock,
    ...overrides,
  });
}

function renderScreen(): void {
  render(
    <MemoryRouter>
      <CaptureScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockedUseQuoteDraft.mockReturnValue({
    draft: null,
    setDraft: setDraftMock,
    clearDraft: clearDraftMock,
  });
  mockVoiceCapture();
  mockedQuoteService.convertNotes.mockResolvedValue(extractionFixture);
  mockedQuoteService.captureAudio.mockResolvedValue(extractionFixture);
  useParamsMock.mockReturnValue({ customerId: "cust-1" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("CaptureScreen", () => {
  it("defaults to voice mode with text mode available", () => {
    renderScreen();

    expect(screen.getByRole("button", { name: "Voice" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Text" })).toBeInTheDocument();
    expect(screen.getByText("Recorder")).toBeInTheDocument();
    expect(screen.queryByLabelText(/notes/i)).not.toBeInTheDocument();
  });

  it("switches to text mode and submits typed notes", async () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Text" }));
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
      sourceType: "text",
    });
    expect(navigateMock).toHaveBeenCalledWith("/quotes/review");
  });

  it("shows inline error when text mode submission fails and does not navigate", async () => {
    mockedQuoteService.convertNotes.mockRejectedValueOnce(new Error("Text extraction failed"));

    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Text" }));
    fireEvent.change(screen.getByLabelText(/notes/i), {
      target: { value: "Install sod in backyard" },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate draft/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Text extraction failed");
    expect(navigateMock).not.toHaveBeenCalledWith("/quotes/review");
  });

  it("keeps voice Generate Draft disabled until at least one clip exists", () => {
    mockVoiceCapture({ clips: [] });

    renderScreen();

    expect(screen.getByRole("button", { name: /generate draft/i })).toBeDisabled();
  });

  it("submits voice clips, sets voice draft, and navigates to review", async () => {
    mockVoiceCapture({ clips: [clipFixture] });

    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: /generate draft/i }));

    await waitFor(() => {
      expect(mockedQuoteService.captureAudio).toHaveBeenCalledWith([clipFixture.blob]);
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

  it("shows inline error when voice mode submission fails and does not navigate", async () => {
    mockVoiceCapture({ clips: [clipFixture] });
    mockedQuoteService.captureAudio.mockRejectedValueOnce(new Error("Voice capture failed"));

    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: /generate draft/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Voice capture failed");
    expect(navigateMock).not.toHaveBeenCalledWith("/quotes/review");
  });

  it("shows staged loading copy for voice submission while request is in flight", async () => {
    vi.useFakeTimers();
    let resolveExtraction: ((value: ExtractionResult) => void) | undefined;
    mockVoiceCapture({ clips: [clipFixture] });
    mockedQuoteService.captureAudio.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveExtraction = resolve;
        }),
    );

    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: /generate draft/i }));

    expect(screen.getByRole("status")).toHaveTextContent("Uploading clips...");

    await act(async () => {
      vi.advanceTimersByTime(1300);
    });

    expect(screen.getByRole("status")).toHaveTextContent("Transcribing audio...");

    await act(async () => {
      resolveExtraction?.(extractionFixture);
    });

    expect(navigateMock).toHaveBeenCalledWith("/quotes/review");
  });
});
