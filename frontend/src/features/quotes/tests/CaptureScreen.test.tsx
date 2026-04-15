import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CaptureScreen } from "@/features/quotes/components/CaptureScreen";
import { useQuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";
import { HOME_ROUTE } from "@/features/quotes/utils/workflowNavigation";
import { useVoiceCapture, type VoiceClip } from "@/features/quotes/hooks/useVoiceCapture";
import { quoteService } from "@/features/quotes/services/quoteService";
import type {
  ExtractionResult,
  JobStatusResponse,
  QuoteDetail,
} from "@/features/quotes/types/quote.types";
import { jobService } from "@/shared/lib/jobService";
import {
  MAX_AUDIO_CLIPS_PER_REQUEST,
  MAX_AUDIO_TOTAL_BYTES,
  NOTE_INPUT_MAX_CHARS,
} from "@/shared/lib/inputLimits";

const navigateMock = vi.fn();
const setDraftMock = vi.fn();
const useParamsMock = vi.fn((): { customerId?: string; id?: string } => ({ customerId: "cust-1" }));

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

vi.mock("@/features/quotes/hooks/useVoiceCapture", () => ({
  useVoiceCapture: vi.fn(),
}));

vi.mock("@/features/quotes/hooks/useQuoteDraft", () => ({
  useQuoteDraft: vi.fn(),
}));

vi.mock("@/features/quotes/services/quoteService", () => ({
  quoteService: {
    extract: vi.fn(),
    appendExtraction: vi.fn(),
    createManualDraft: vi.fn(),
    convertNotes: vi.fn(),
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

const mockedUseVoiceCapture = vi.mocked(useVoiceCapture);
const mockedUseQuoteDraft = vi.mocked(useQuoteDraft);
const mockedQuoteService = vi.mocked(quoteService);
const mockedJobService = vi.mocked(jobService);

const extractionFixture: ExtractionResult = {
  transcript: "5 yards brown mulch",
  pipeline_version: "v2",
  line_items: [
    {
      raw_text: "5 yards brown mulch",
      description: "Brown mulch",
      details: "5 yards",
      price: 120,
      flagged: true,
      flag_reason: "Unit phrasing may be ambiguous",
      confidence: "medium",
    },
  ],
  pricing_hints: {
    explicit_total: 120,
    deposit_amount: null,
    tax_rate: null,
    discount_type: null,
    discount_value: null,
  },
  customer_notes_suggestion: null,
  unresolved_segments: [],
  confidence_notes: [],
  extraction_tier: "primary",
  extraction_degraded_reason_code: null,
};

const quoteDetailFixture: QuoteDetail = {
  id: "quote-1",
  customer_id: "cust-1",
  extraction_tier: "primary",
  extraction_degraded_reason_code: null,
  extraction_review_metadata: {
    pipeline_version: "v2",
    review_state: {
      notes_pending: false,
      pricing_pending: false,
    },
    seeded_fields: {
      notes: { seeded: false, confidence: null, source: null },
      pricing: {
        explicit_total: { seeded: true, source: "explicit_pricing_phrase" },
        deposit_amount: { seeded: false, source: null },
        tax_rate: { seeded: false, source: null },
        discount: { seeded: false, source: null },
      },
    },
    hidden_details: {
      unresolved_segments: [],
      append_suggestions: [],
      confidence_notes: [],
    },
    extraction_degraded_reason_code: null,
  },
  customer_name: null,
  customer_email: null,
  customer_phone: null,
  doc_number: "Q-001",
  title: null,
  status: "draft",
  source_type: "text",
  transcript: extractionFixture.transcript,
  total_amount: 120,
  tax_rate: null,
  discount_type: null,
  discount_value: null,
  deposit_amount: null,
  notes: null,
  shared_at: null,
  share_token: null,
  has_active_share: false,
  linked_invoice: null,
  pdf_artifact: {
    status: "missing",
    job_id: null,
    download_url: null,
    terminal_error: null,
  },
  line_items: [
    {
      id: "line-1",
      description: "Brown mulch",
      details: "5 yards",
      price: 120,
      flagged: true,
      flag_reason: "Unit phrasing may be ambiguous",
      sort_order: 0,
    },
  ],
  created_at: "2026-03-20T00:00:00.000Z",
  updated_at: "2026-03-20T00:00:00.000Z",
};

const clipFixture: VoiceClip = {
  id: "clip-1",
  blob: new Blob(["clip-1"], { type: "audio/webm" }),
  url: "blob:clip-1",
  durationSeconds: 4,
};

function makeJobStatusResponse(
  overrides: Partial<JobStatusResponse> = {},
): JobStatusResponse {
  return {
    id: "job-1",
    user_id: "user-1",
    document_id: null,
    document_revision: null,
    job_type: "extraction",
    status: "pending",
    attempts: 0,
    terminal_error: null,
    extraction_result: null,
    quote_id: null,
    created_at: "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
    ...overrides,
  };
}

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

function renderScreen({
  launchOrigin = HOME_ROUTE,
  pathname = "/quotes/capture/cust-1",
  customerId = "cust-1",
  quoteId = null,
}: {
  launchOrigin?: string;
  pathname?: string;
  customerId?: string | null;
  quoteId?: string | null;
} = {}) {
  useParamsMock.mockReturnValue({
    ...(customerId ? { customerId } : {}),
    ...(quoteId ? { id: quoteId } : {}),
  });
  return render(
    <MemoryRouter initialEntries={[{ pathname, state: { launchOrigin } }]}>
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
  mockedQuoteService.extract.mockResolvedValue({ type: "sync", quoteId: "quote-1", result: extractionFixture });
  mockedQuoteService.appendExtraction.mockReset();
  mockedQuoteService.getQuote.mockResolvedValue(quoteDetailFixture);
  mockedQuoteService.createManualDraft.mockResolvedValue({
    id: "quote-manual-1",
    customer_id: "cust-1",
    doc_number: "Q-099",
    title: null,
    status: "draft",
    source_type: "text",
    transcript: "",
    total_amount: null,
    tax_rate: null,
    discount_type: null,
    discount_value: null,
    deposit_amount: null,
    notes: null,
    shared_at: null,
    share_token: null,
    line_items: [],
    created_at: "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
  });
  mockedJobService.getJobStatus.mockReset();
  useParamsMock.mockReturnValue({ customerId: "cust-1" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  window.localStorage.clear();
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

    const notesValue = "Install sod in backyard";
    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: notesValue },
    });

    expect(screen.getByRole("button", { name: /extract line items/i })).toBeEnabled();
    expect(screen.getByLabelText(/written description/i)).toHaveAttribute(
      "maxLength",
      NOTE_INPUT_MAX_CHARS.toString(),
    );
    expect(
      screen.queryByText(`${notesValue.length}/${NOTE_INPUT_MAX_CHARS}`),
    ).not.toBeInTheDocument();
  });

  it("shows Start Blank affordance in new capture mode", () => {
    renderScreen();

    expect(
      screen.getByRole("button", { name: "Or start with a blank document" }),
    ).toBeInTheDocument();
  });

  it("hides Start Blank affordance in append mode", () => {
    renderScreen({
      pathname: "/quotes/quote-1/review/append-capture",
      customerId: null,
      quoteId: "quote-1",
    });

    expect(
      screen.queryByRole("button", { name: "Or start with a blank document" }),
    ).not.toBeInTheDocument();
  });

  it("renders recorded clips inside a bounded scroll region", () => {
    mockVoiceCapture({ clips: [clipFixture, { ...clipFixture, id: "clip-2", url: "blob:clip-2" }] });
    renderScreen();

    const scrollRegion = screen.getByTestId("recorded-clips-scroll-region");
    expect(scrollRegion).toHaveClass(
      "overflow-y-auto",
      "h-[clamp(8rem,20dvh,13rem)]",
    );
  });

  it("renders the written description textarea with 2 rows", () => {
    renderScreen();

    const textarea = screen.getByLabelText("WRITTEN DESCRIPTION");
    expect(textarea).toHaveAttribute("rows", "2");
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
    const extractDeferred = new Promise<{ type: "sync"; quoteId: string; result: ExtractionResult }>(() => {});
    mockedQuoteService.extract.mockReturnValueOnce(extractDeferred);
    renderScreen();

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "Install sod in backyard" },
    });

    expect(
      screen.queryByText(/extraction saves your notes as a draft checkpoint/i),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /extract line items/i }));

    expect(await screen.findByText("Analyzing notes...")).toBeInTheDocument();
    expect(screen.getByText(/extraction saves your notes as a draft checkpoint/i)).toBeInTheDocument();
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
    renderScreen({ launchOrigin: "/customers/cust-1" });

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
    renderScreen({ launchOrigin: "/customers/cust-1" });

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

  it("submits extraction with customer context and routes to persisted review id", async () => {
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
        customerId: "cust-1",
      });
    });
    expect(navigateMock).toHaveBeenCalledWith("/documents/quote-1/edit");
    expect(setDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quoteId: "quote-1",
        customerId: "cust-1",
      }),
    );
    expect(mockedQuoteService.createQuote).not.toHaveBeenCalled();
  });

  it("starts a blank draft with customer context and routes to edit", async () => {
    renderScreen();

    fireEvent.click(
      screen.getByRole("button", { name: "Or start with a blank document" }),
    );

    await waitFor(() => {
      expect(mockedQuoteService.createManualDraft).toHaveBeenCalledWith({
        customerId: "cust-1",
      });
    });
    expect(navigateMock).toHaveBeenCalledWith("/documents/quote-manual-1/edit");
  });

  it("guards Start Blank with confirmation when unsaved notes and clips exist", async () => {
    mockVoiceCapture({ clips: [clipFixture] });
    renderScreen();

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "Install sod in backyard" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Or start with a blank document" }),
    );

    expect(screen.getByRole("dialog", { name: "Leave this screen?" })).toBeInTheDocument();
    expect(mockedQuoteService.createManualDraft).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Stay" }));
    expect(screen.queryByRole("dialog", { name: "Leave this screen?" })).not.toBeInTheDocument();
    expect(mockedQuoteService.createManualDraft).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Or start with a blank document" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));

    await waitFor(() => {
      expect(mockedQuoteService.createManualDraft).toHaveBeenCalledWith({
        customerId: "cust-1",
      });
    });
    expect(navigateMock).toHaveBeenCalledWith("/documents/quote-manual-1/edit");
  });

  it("starts a blank draft without customer context and routes to edit", async () => {
    mockedQuoteService.createManualDraft.mockResolvedValueOnce({
      id: "quote-manual-home",
      customer_id: null,
      doc_number: "Q-100",
      title: null,
      status: "draft",
      source_type: "text",
      transcript: "",
      total_amount: null,
      tax_rate: null,
      discount_type: null,
      discount_value: null,
      deposit_amount: null,
      notes: null,
      shared_at: null,
      share_token: null,
      line_items: [],
      created_at: "2026-03-20T00:00:00.000Z",
      updated_at: "2026-03-20T00:00:00.000Z",
    });
    renderScreen({ pathname: "/quotes/capture", customerId: null });

    fireEvent.click(
      screen.getByRole("button", { name: "Or start with a blank document" }),
    );

    await waitFor(() => {
      expect(mockedQuoteService.createManualDraft).toHaveBeenCalledWith({
        customerId: undefined,
      });
    });
    expect(navigateMock).toHaveBeenCalledWith("/documents/quote-manual-home/edit");
  });

  it("submits append extraction from review and requests draft reseed without local confidence-note writes", async () => {
    mockedQuoteService.appendExtraction.mockResolvedValueOnce({
      type: "sync",
      quoteId: "quote-1",
      result: {
        ...extractionFixture,
        confidence_notes: ["Backend output remains available for metadata, but review state is sidecar-driven."],
      },
    });
    mockedQuoteService.getQuote.mockResolvedValueOnce({
      ...quoteDetailFixture,
      extraction_review_metadata: {
        ...quoteDetailFixture.extraction_review_metadata!,
        hidden_details: {
          unresolved_segments: [],
          append_suggestions: [],
          confidence_notes: ["New note"],
        },
      },
    });
    renderScreen({
      pathname: "/quotes/quote-1/review/append-capture",
      customerId: null,
      quoteId: "quote-1",
    });

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "  add one more cleanup item  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /extract more line items/i }));

    await waitFor(() => {
      expect(mockedQuoteService.appendExtraction).toHaveBeenCalledWith("quote-1", {
        clips: [],
        notes: "  add one more cleanup item  ",
      });
    });
    expect(navigateMock).toHaveBeenCalledWith("/documents/quote-1/edit", {
      state: { reseedDraft: true },
    });
    expect(setDraftMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("stima_review_confidence_notes:quote-1")).toBeNull();
  });

  it("submits home capture without customer context and routes when polling returns quote_id", async () => {
    mockedQuoteService.extract.mockResolvedValueOnce({ type: "async", jobId: "job-home" });
    mockedJobService.getJobStatus.mockResolvedValueOnce(
      makeJobStatusResponse({
        status: "running",
        extraction_result: extractionFixture,
        quote_id: "quote-home",
      }),
    );
    mockedQuoteService.getQuote.mockResolvedValueOnce({
      ...quoteDetailFixture,
      id: "quote-home",
      customer_id: null,
    });
    renderScreen({ pathname: "/quotes/capture", customerId: null });

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "Install sod in backyard" },
    });
    fireEvent.click(screen.getByRole("button", { name: /extract line items/i }));

    await waitFor(() => {
      expect(mockedQuoteService.extract).toHaveBeenCalledWith({
        clips: [],
        notes: "Install sod in backyard",
        customerId: undefined,
      });
    });
    expect(mockedJobService.getJobStatus).toHaveBeenCalledWith("job-home");
    expect(navigateMock).toHaveBeenCalledWith("/documents/quote-home/edit");
    expect(setDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quoteId: "quote-home",
        customerId: "",
      }),
    );
  });

  it("routes notes-only sync extraction to persisted review id", async () => {
    mockedQuoteService.extract.mockResolvedValueOnce({
      type: "sync",
      quoteId: "quote-notes",
      result: extractionFixture,
    });
    renderScreen();

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "Install sod in backyard" },
    });
    fireEvent.click(screen.getByRole("button", { name: /extract line items/i }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/documents/quote-notes/edit"));
    expect(setDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quoteId: "quote-notes",
        sourceType: "text",
      }),
    );
  });

  it("shows persistent error toast and does not navigate when extraction fails", async () => {
    mockedQuoteService.extract.mockRejectedValueOnce(new Error("Extraction failed"));
    renderScreen();

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "Install sod in backyard" },
    });
    fireEvent.click(screen.getByRole("button", { name: /extract line items/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Extraction failed");
    expect(navigateMock).not.toHaveBeenCalledWith("/documents/quote-1/edit");
  });

  it("dismisses submission errors via local error state without clearing voice capture", async () => {
    mockedQuoteService.extract.mockRejectedValueOnce(new Error("Extraction failed"));
    renderScreen();

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "Install sod in backyard" },
    });
    fireEvent.click(screen.getByRole("button", { name: /extract line items/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Extraction failed");
    clearVoiceErrorMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
    expect(clearVoiceErrorMock).not.toHaveBeenCalled();
  });

  it("dismisses recoverable voice-capture runtime errors via clearError", async () => {
    mockVoiceCapture({ error: "Microphone permission denied" });
    renderScreen();

    expect(await screen.findByRole("alert")).toHaveTextContent("Microphone permission denied");
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    expect(clearVoiceErrorMock).toHaveBeenCalledTimes(1);
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

    let resolveExtraction: ((value: { type: "sync"; quoteId: string; result: ExtractionResult }) => void) | undefined;
    mockedQuoteService.extract.mockReturnValueOnce(
      new Promise<{ type: "sync"; quoteId: string; result: ExtractionResult }>((resolve) => {
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
      screen.getByText("Extraction saves your notes as a draft checkpoint. You can capture more notes later from review."),
    ).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.getByText("Extracting line items...")).toBeInTheDocument();

    await act(async () => {
      resolveExtraction?.({ type: "sync", quoteId: "quote-1", result: extractionFixture });
      await Promise.resolve();
    });

    expect(screen.queryByText("Extracting line items...")).not.toBeInTheDocument();
  });

  it("shows audio-specific staged copy when extracting recorded clips", async () => {
    vi.useFakeTimers();

    let resolveExtraction: ((value: { type: "sync"; quoteId: string; result: ExtractionResult }) => void) | undefined;
    mockedQuoteService.extract.mockReturnValueOnce(
      new Promise<{ type: "sync"; quoteId: string; result: ExtractionResult }>((resolve) => {
        resolveExtraction = resolve;
      }),
    );
    mockVoiceCapture({ clips: [clipFixture] });

    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: /extract line items/i }));

    expect(screen.getByText("Uploading audio...")).toBeInTheDocument();
    expect(
      screen.getByText("Extraction saves your recording as a draft checkpoint. You can capture more notes later from review."),
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
      resolveExtraction?.({ type: "sync", quoteId: "quote-1", result: extractionFixture });
      await Promise.resolve();
    });

    expect(screen.queryByText("Extracting line items...")).not.toBeInTheDocument();
  });

  it("shows mixed-input staged copy when clips and notes are both present", async () => {
    vi.useFakeTimers();

    let resolveExtraction: ((value: { type: "sync"; quoteId: string; result: ExtractionResult }) => void) | undefined;
    mockedQuoteService.extract.mockReturnValueOnce(
      new Promise<{ type: "sync"; quoteId: string; result: ExtractionResult }>((resolve) => {
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
      screen.getByText("Extraction saves one draft from your recording and notes. You can capture more notes later from review."),
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
      resolveExtraction?.({ type: "sync", quoteId: "quote-1", result: extractionFixture });
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

  it("polls async extraction jobs until quote_id is available and routes to persisted review id", async () => {
    vi.useFakeTimers();
    mockedQuoteService.extract.mockResolvedValueOnce({ type: "async", jobId: "job-1" });
    mockedJobService.getJobStatus
      .mockResolvedValueOnce(makeJobStatusResponse())
      .mockResolvedValueOnce(
        makeJobStatusResponse({
          status: "success",
          attempts: 1,
          extraction_result: extractionFixture,
          quote_id: "quote-async",
          updated_at: "2026-03-20T00:00:02.000Z",
        }),
      );

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
    expect(navigateMock).toHaveBeenCalledWith("/documents/quote-async/edit");
    expect(setDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quoteId: "quote-async",
      }),
    );
    expect(mockedQuoteService.createQuote).not.toHaveBeenCalled();
  });

  it("shows an error when async extraction succeeds without a persisted quote id", async () => {
    mockedQuoteService.extract.mockResolvedValueOnce({ type: "async", jobId: "job-1" });
    mockedJobService.getJobStatus.mockResolvedValueOnce(
      makeJobStatusResponse({
        status: "success",
        attempts: 1,
        extraction_result: extractionFixture,
        quote_id: null,
      }),
    );

    renderScreen();

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "Install sod in backyard" },
    });
    fireEvent.click(screen.getByRole("button", { name: /extract line items/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Extraction completed without a persisted draft. Please try again.",
    );
    expect(navigateMock).not.toHaveBeenCalledWith("/documents/quote-1/edit");
  });

  it("shows a dismissable error toast when an async extraction job reaches terminal failure", async () => {
    mockedQuoteService.extract.mockResolvedValueOnce({ type: "async", jobId: "job-1" });
    mockedJobService.getJobStatus.mockResolvedValueOnce(
      makeJobStatusResponse({
        status: "terminal",
        attempts: 3,
        terminal_error: "retry_exhausted",
        updated_at: "2026-03-20T00:00:02.000Z",
      }),
    );

    renderScreen();

    fireEvent.change(screen.getByLabelText(/written description/i), {
      target: { value: "Install sod in backyard" },
    });
    fireEvent.click(screen.getByRole("button", { name: /extract line items/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Extraction failed. Please try again.");
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /extract line items/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a timeout error when async extraction polling exceeds the max attempts", async () => {
    vi.useFakeTimers();
    mockedQuoteService.extract.mockResolvedValueOnce({ type: "async", jobId: "job-1" });
    mockedJobService.getJobStatus.mockResolvedValue(makeJobStatusResponse());

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

  it("does not redirect to review after leaving during in-flight extraction", async () => {
    let resolveExtraction: ((value: { type: "sync"; quoteId: string; result: ExtractionResult }) => void) | undefined;
    mockedQuoteService.extract.mockReturnValueOnce(
      new Promise<{ type: "sync"; quoteId: string; result: ExtractionResult }>((resolve) => {
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
      resolveExtraction?.({ type: "sync", quoteId: "quote-1", result: extractionFixture });
      await Promise.resolve();
    });

    expect(navigateMock).not.toHaveBeenCalledWith("/documents/quote-1/edit");
  });
});
