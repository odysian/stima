import { afterEach, describe, expect, it, vi } from "vitest";

import { AudioClipMissingError } from "@/features/quotes/offline/captureTypes";
import { getAudioClip } from "@/features/quotes/offline/audioRepository";
import { quoteService } from "@/features/quotes/services/quoteService";
import { request, requestWithMetadata } from "@/shared/lib/http";

vi.mock("@/shared/lib/http", () => ({
  request: vi.fn(),
  requestWithMetadata: vi.fn(),
  requestBlob: vi.fn(),
}));
vi.mock("@/features/quotes/offline/audioRepository", () => ({
  getAudioClip: vi.fn(),
}));

const mockedRequestWithMetadata = vi.mocked(requestWithMetadata);
const mockedRequest = vi.mocked(request);
const mockedGetAudioClip = vi.mocked(getAudioClip);

describe("quoteService.extract", () => {
  const extractionPayload = {
    transcript: "typed note only",
    line_items: [],
    pricing_hints: {
      explicit_total: null,
      deposit_amount: null,
      tax_rate: null,
      discount_type: null,
      discount_value: null,
    },
    customer_notes_suggestion: null,
    extraction_tier: "primary" as const,
    extraction_degraded_reason_code: null,
  };

  afterEach(() => {
    mockedRequestWithMetadata.mockReset();
    mockedRequest.mockReset();
    mockedGetAudioClip.mockReset();
  });

  it("builds multipart form data with clip IDs and trimmed notes for async extraction", async () => {
    mockedRequestWithMetadata.mockResolvedValue({
      status: 202,
      data: {
        id: "job-1",
      },
    });
    mockedGetAudioClip
      .mockResolvedValueOnce({
        clipId: "clip-id-1",
        sessionId: "session-1",
        userId: "user-1",
        blob: new Blob(["clip-a"], { type: "audio/mp4" }),
        mimeType: "audio/mp4",
        sizeBytes: 6,
        durationSeconds: 2,
        sequenceNumber: 1,
        createdAt: "2026-04-24T00:00:00.000Z",
      })
      .mockResolvedValueOnce({
        clipId: "clip-id-2",
        sessionId: "session-1",
        userId: "user-1",
        blob: new Blob(["clip-b"], { type: "audio/webm;codecs=opus" }),
        mimeType: "audio/webm;codecs=opus",
        sizeBytes: 6,
        durationSeconds: 3,
        sequenceNumber: 2,
        createdAt: "2026-04-24T00:00:01.000Z",
      });

    const result = await quoteService.extract({
      clipIds: ["clip-id-1", "clip-id-2"],
      notes: "  add 10% travel surcharge  ",
      customerId: "cust-1",
    });

    expect(result).toEqual({ type: "async", jobId: "job-1" });
    expect(mockedRequestWithMetadata).toHaveBeenCalledTimes(1);
    const [path, options] = mockedRequestWithMetadata.mock.calls[0] ?? [];
    expect(path).toBe("/api/quotes/extract");
    expect(options?.method).toBe("POST");

    const formData = options?.body;
    expect(formData).toBeInstanceOf(FormData);

    const clips = (formData as FormData).getAll("clips");
    expect(clips).toHaveLength(2);
    expect((clips[0] as File).name).toBe("clip-1.mp4");
    expect((clips[1] as File).name).toBe("clip-2.webm");
    expect((formData as FormData).get("notes")).toBe("add 10% travel surcharge");
    expect((formData as FormData).get("customer_id")).toBe("cust-1");
  });

  it("sends notes without clips for notes-only extraction and returns persisted quote id", async () => {
    mockedRequestWithMetadata.mockResolvedValue({
      status: 200,
      data: {
        quote_id: "quote-11",
        ...extractionPayload,
      },
    });

    const result = await quoteService.extract({ notes: "typed note only" });

    expect(result).toEqual({
      type: "sync",
      quoteId: "quote-11",
      result: extractionPayload,
    });

    const [, options] = mockedRequestWithMetadata.mock.calls[0] ?? [];
    const formData = options?.body as FormData;
    expect(formData.getAll("clips")).toHaveLength(0);
    expect(formData.get("notes")).toBe("typed note only");
  });

  it("omits notes field for clips-only extraction", async () => {
    mockedRequestWithMetadata.mockResolvedValue({
      status: 200,
      data: {
        quote_id: "quote-22",
        ...extractionPayload,
        transcript: "clips only",
      },
    });
    mockedGetAudioClip.mockResolvedValueOnce({
      clipId: "clip-id-1",
      sessionId: "session-1",
      userId: "user-1",
      blob: new Blob(["clip-a"], { type: "audio/webm" }),
      mimeType: "audio/webm",
      sizeBytes: 6,
      durationSeconds: 3,
      sequenceNumber: 1,
      createdAt: "2026-04-24T00:00:00.000Z",
    });

    await quoteService.extract({
      clipIds: ["clip-id-1"],
    });

    const [, options] = mockedRequestWithMetadata.mock.calls[0] ?? [];
    const formData = options?.body as FormData;
    expect(formData.getAll("clips")).toHaveLength(1);
    expect((formData.getAll("clips")[0] as File).name).toBe("clip-1.webm");
    expect(formData.get("notes")).toBeNull();
    expect(formData.get("customer_id")).toBeNull();
  });

  it("throws AudioClipMissingError and skips submit when a clip ID is missing from IndexedDB", async () => {
    mockedGetAudioClip.mockResolvedValueOnce(null);

    await expect(
      quoteService.extract({
        clipIds: ["missing-clip"],
        notes: "Install sod in backyard",
      }),
    ).rejects.toBeInstanceOf(AudioClipMissingError);
    expect(mockedRequestWithMetadata).not.toHaveBeenCalled();
  });

  it("creates manual draft with customer payload when customerId is provided", async () => {
    mockedRequest.mockResolvedValue({
      id: "quote-manual-1",
    });

    await quoteService.createManualDraft({ customerId: "cust-1" });

    const [path, options] = mockedRequest.mock.calls[0] ?? [];
    expect(path).toBe("/api/quotes/manual-draft");
    expect(options?.method).toBe("POST");
    expect(options?.body).toEqual({ customer_id: "cust-1" });
  });

  it("creates manual draft with empty payload when customerId is omitted", async () => {
    mockedRequest.mockResolvedValue({
      id: "quote-manual-2",
    });

    await quoteService.createManualDraft();

    const [path, options] = mockedRequest.mock.calls[0] ?? [];
    expect(path).toBe("/api/quotes/manual-draft");
    expect(options?.method).toBe("POST");
    expect(options?.body).toEqual({});
  });
});
