import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CaptureScreen } from "@/features/quotes/components/CaptureScreen";
import { useQuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";
import { HOME_ROUTE } from "@/features/quotes/utils/workflowNavigation";
import { useVoiceCapture, type VoiceClip } from "@/features/quotes/hooks/useVoiceCapture";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { ExtractionResult } from "@/features/quotes/types/quote.types";
import { jobService } from "@/shared/lib/jobService";
import {
  MAX_AUDIO_CLIPS_PER_REQUEST,
  MAX_AUDIO_TOTAL_BYTES,
  NOTE_INPUT_MAX_CHARS,
} from "@/shared/lib/inputLimits";

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

vi.mock("@/shared/lib/jobService", () => ({
  jobService: {
    getJobStatus: vi.fn(),
  },
}));

const mockedUseQuoteDraft = vi.mocked(useQuoteDraft);
const mockedUseVoiceCapture = vi.mocked(useVoiceCapture);
const mockedQuoteService = vi.mocked(quoteService);
const mockedJobService = vi.mocked(jobService);

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

function renderScreen(launchOrigin = HOME_ROUTE) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/quotes/capture/cust-1", state: { launchOrigin } }]}>
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
  mockedQuoteService.extract.mockResolvedValue({ type: "sync", result: extractionFixture });
  mockedJobService.getJobStatus.mockReset();
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
    expect(screen.getByLabelText(/written description/i)).toHaveAttribute(
      "maxLength",
      NOTE_INPUT_MAX_CHARS.toString(),
    );
  });

  it("disables recording when the clip-count limit is reached", () => {
    const clips = Array.from({ length: MAX_AUDIO_CLIPS_PER_REQUEST }, (_, index) => ({
      ...clipFixture,
      id: `clip-${index + 1}`,
      url: `blob:clip-${index + 1}`,
    }));
    mockVoiceCapture({ clips });
    renderScreen();

    expect(
      screen.getByText(`Maximum of ${MAX_AUDIO_CLIPS_PER_REQUEST} clips per request reached.`),
    ).toBeInTheDocument();
    const startButton = screen.getByText("mic").closest("button");
    expect(startButton).toBeDisabled();
  });

  it("enables extract button when at least one clip exists", () => {
    mockVoiceCapture({ clips: [clipFixture] });
    renderScreen();

    expect(screen.getByRole("button", { name: /extract line items/i })).toBeEnabled();
  });

  it("shows extraction helper copy only while extraction is active", async () => {
    const extractDeferred = new Promise<{ type: "sync"; result: ExtractionResult }>(() => {});
    mockedQuoteService.extract.mockReturnValueOnce(extractDeferred);
    renderScreen();

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "Install sod in backyard" },
    });

    expect(
      screen.queryByText(/we will turn your notes into draft line items/i),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /extract line items/i }));

    expect(await screen.findByText("Analyzing notes...")).toBeInTheDocument();
    expect(screen.getByText(/we will turn your notes into draft line items/i)).toBeInTheDocument();
  });

  it("shows recording state with stop button and elapsed time", () => {
    mockVoiceCapture({ isRecording: true, elapsedSeconds: 3 });
    renderScreen();

    expect(screen.getByText("Recording... 00:03")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /stop/i })).toBeInTheDocument();
  });

  it("uses token-backed styles for the start recording control", () => {
    renderScreen();

    const startButton = screen.getByText("mic").closest("button");
    if (!startButton) {
      throw new Error("Expected start recording button to render");
    }

    expect(startButton).toHaveClass("forest-gradient", "ghost-shadow", "text-on-primary");
  });

  it("uses token-backed styles for the stop recording control", () => {
    mockVoiceCapture({ isRecording: true, elapsedSeconds: 3 });
    renderScreen();

    const stopButton = screen.getByRole("button", { name: /stop/i });
    expect(stopButton).toHaveClass("ghost-shadow", "bg-secondary", "text-on-secondary");
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
    expect(navigateMock).not.toHaveBeenCalledWith(HOME_ROUTE, { replace: true });
  });

  it("shows a leave confirmation when navigating back with unsaved notes", () => {
    renderScreen();

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "Install sod in backyard" },
    });
    fireEvent.click(screen.getByRole("button", { name: /go back/i }));

    expect(screen.getByRole("dialog", { name: "Leave this screen?" })).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalledWith(HOME_ROUTE, { replace: true });
  });

  it("navigates back to the recorded launch origin when there is no unsaved work", () => {
    renderScreen("/customers/cust-1");

    fireEvent.click(screen.getByRole("button", { name: /go back/i }));

    expect(navigateMock).toHaveBeenCalledWith("/customers/cust-1", { replace: true });
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
    expect(navigateMock).not.toHaveBeenCalledWith(HOME_ROUTE, { replace: true });
  });

  it("navigates to the launch origin after confirming Leave", () => {
    renderScreen("/customers/cust-1");

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "Install sod in backyard" },
    });
    fireEvent.click(screen.getByRole("button", { name: /go back/i }));
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));

    expect(navigateMock).toHaveBeenCalledWith("/customers/cust-1", { replace: true });
  });

  it("shows the same leave confirmation when exiting home with unsaved work", () => {
    renderScreen();

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "Install sod in backyard" },
    });
    fireEvent.click(screen.getByRole("button", { name: /exit to home/i }));

    expect(screen.getByRole("dialog", { name: "Leave this screen?" })).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalledWith(HOME_ROUTE, { replace: true });
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
      launchOrigin: HOME_ROUTE,
      title: "",
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
      taxRate: null,
      discountType: null,
      discountValue: null,
      depositAmount: null,
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

  it("derives the total audio limit error from the shared byte ceiling", async () => {
    const oversizedBlob = new Blob(["clip-1"], { type: "audio/webm" });
    Object.defineProperty(oversizedBlob, "size", { value: MAX_AUDIO_TOTAL_BYTES + 1 });
    mockVoiceCapture({
      clips: [
        {
          ...clipFixture,
          blob: oversizedBlob,
        },
      ],
    });
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: /extract line items/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      `Total audio upload must be ${MAX_AUDIO_TOTAL_BYTES / (1024 * 1024)} MB or smaller.`,
    );
    expect(mockedQuoteService.extract).not.toHaveBeenCalled();
  });

  it("shows staged extraction progress and clears it after extraction resolves", async () => {
    vi.useFakeTimers();

    let resolveExtraction: ((value: { type: "sync"; result: ExtractionResult }) => void) | undefined;
    mockedQuoteService.extract.mockReturnValueOnce(
      new Promise<{ type: "sync"; result: ExtractionResult }>((resolve) => {
        resolveExtraction = resolve;
      }),
    );

    renderScreen();

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "Install sod in backyard" },
    });
    fireEvent.click(screen.getByRole("button", { name: /extract line items/i }));

    expect(screen.getByText("Analyzing notes...")).toBeInTheDocument();
    expect(
      screen.getByText("We will turn your notes into draft line items. If extraction fails, your notes stay here."),
    ).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.getByText("Extracting line items...")).toBeInTheDocument();

    await act(async () => {
      resolveExtraction?.({ type: "sync", result: extractionFixture });
      await Promise.resolve();
    });

    expect(screen.queryByText("Extracting line items...")).not.toBeInTheDocument();
  });

  it("shows audio-specific staged copy when extracting recorded clips", async () => {
    vi.useFakeTimers();

    let resolveExtraction: ((value: { type: "sync"; result: ExtractionResult }) => void) | undefined;
    mockedQuoteService.extract.mockReturnValueOnce(
      new Promise<{ type: "sync"; result: ExtractionResult }>((resolve) => {
        resolveExtraction = resolve;
      }),
    );
    mockVoiceCapture({ clips: [clipFixture] });

    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: /extract line items/i }));

    expect(screen.getByText("Uploading audio...")).toBeInTheDocument();
    expect(
      screen.getByText("Audio uploads and transcription can take a few moments. If extraction fails, your clips stay here."),
    ).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.getByText("Transcribing audio...")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.getByText("Extracting line items...")).toBeInTheDocument();

    await act(async () => {
      resolveExtraction?.({ type: "sync", result: extractionFixture });
      await Promise.resolve();
    });

    expect(screen.queryByText("Extracting line items...")).not.toBeInTheDocument();
  });

  it("shows mixed-input staged copy when clips and notes are both present", async () => {
    vi.useFakeTimers();

    let resolveExtraction: ((value: { type: "sync"; result: ExtractionResult }) => void) | undefined;
    mockedQuoteService.extract.mockReturnValueOnce(
      new Promise<{ type: "sync"; result: ExtractionResult }>((resolve) => {
        resolveExtraction = resolve;
      }),
    );
    mockVoiceCapture({ clips: [clipFixture] });

    renderScreen();

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "Also edge the front beds" },
    });
    fireEvent.click(screen.getByRole("button", { name: /extract line items/i }));

    expect(screen.getByText("Uploading audio...")).toBeInTheDocument();
    expect(
      screen.getByText("We will combine your recording and notes into one draft. If extraction fails, both stay here."),
    ).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.getByText("Transcribing audio...")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.getByText("Extracting line items from audio and notes...")).toBeInTheDocument();

    await act(async () => {
      resolveExtraction?.({ type: "sync", result: extractionFixture });
      await Promise.resolve();
    });
  });

  it("preserves typed notes and recorded clips after extraction fails", async () => {
    mockedQuoteService.extract.mockRejectedValueOnce(new Error("Extraction failed"));
    mockVoiceCapture({ clips: [clipFixture] });

    renderScreen();

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "Install sod in backyard" },
    });
    fireEvent.click(screen.getByRole("button", { name: /extract line items/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Extraction failed");
    expect(screen.getByLabelText(/written description/i)).toHaveValue("Install sod in backyard");
    expect(screen.getByText("Clip 1 · 4s")).toBeInTheDocument();
  });

  it("polls async extraction jobs until success and then navigates to review", async () => {
    vi.useFakeTimers();
    mockedQuoteService.extract.mockResolvedValueOnce({ type: "async", jobId: "job-1" });
    mockedJobService.getJobStatus
      .mockResolvedValueOnce({
        id: "job-1",
        user_id: "user-1",
        document_id: null,
        job_type: "extraction",
        status: "pending",
        attempts: 0,
        terminal_error: null,
        extraction_result: null,
        created_at: "2026-03-20T00:00:00.000Z",
        updated_at: "2026-03-20T00:00:00.000Z",
      })
      .mockResolvedValueOnce({
        id: "job-1",
        user_id: "user-1",
        document_id: null,
        job_type: "extraction",
        status: "success",
        attempts: 1,
        terminal_error: null,
        extraction_result: extractionFixture,
        created_at: "2026-03-20T00:00:00.000Z",
        updated_at: "2026-03-20T00:00:02.000Z",
      });

    renderScreen();

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "Install sod in backyard" },
    });
    fireEvent.click(screen.getByRole("button", { name: /extract line items/i }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedJobService.getJobStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedJobService.getJobStatus).toHaveBeenCalledTimes(2);
    expect(navigateMock).toHaveBeenCalledWith("/quotes/review");
  });

  it("shows a retry affordance when an async extraction job reaches terminal failure", async () => {
    mockedQuoteService.extract.mockResolvedValueOnce({ type: "async", jobId: "job-1" });
    mockedJobService.getJobStatus.mockResolvedValueOnce({
      id: "job-1",
      user_id: "user-1",
      document_id: null,
      job_type: "extraction",
      status: "terminal",
      attempts: 3,
      terminal_error: "retry_exhausted",
      extraction_result: null,
      created_at: "2026-03-20T00:00:00.000Z",
      updated_at: "2026-03-20T00:00:02.000Z",
    });

    renderScreen();

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "Install sod in backyard" },
    });
    fireEvent.click(screen.getByRole("button", { name: /extract line items/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Extraction failed. Please try again.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a timeout error when async extraction polling exceeds the max attempts", async () => {
    vi.useFakeTimers();
    mockedQuoteService.extract.mockResolvedValueOnce({ type: "async", jobId: "job-1" });
    mockedJobService.getJobStatus.mockResolvedValue({
      id: "job-1",
      user_id: "user-1",
      document_id: null,
      job_type: "extraction",
      status: "pending",
      attempts: 0,
      terminal_error: null,
      extraction_result: null,
      created_at: "2026-03-20T00:00:00.000Z",
      updated_at: "2026-03-20T00:00:00.000Z",
    });

    renderScreen();

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "Install sod in backyard" },
    });
    fireEvent.click(screen.getByRole("button", { name: /extract line items/i }));

    await act(async () => {
      await Promise.resolve();
    });

    for (let count = 0; count < 59; count += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
    }

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Extraction is taking longer than expected. Please try again.",
    );
  });

  it("does not apply the draft or redirect to review after leaving during in-flight extraction", async () => {
    let resolveExtraction: ((value: { type: "sync"; result: ExtractionResult }) => void) | undefined;
    mockedQuoteService.extract.mockReturnValueOnce(
      new Promise<{ type: "sync"; result: ExtractionResult }>((resolve) => {
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

    expect(navigateMock).toHaveBeenCalledWith(HOME_ROUTE, { replace: true });

    view.unmount();

    await act(async () => {
      resolveExtraction?.({ type: "sync", result: extractionFixture });
      await Promise.resolve();
    });

    expect(setDraftMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalledWith("/quotes/review");
  });
});
