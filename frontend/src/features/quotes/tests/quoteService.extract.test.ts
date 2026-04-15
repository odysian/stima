import { afterEach, describe, expect, it, vi } from "vitest";

import { quoteService } from "@/features/quotes/services/quoteService";
import { request, requestWithMetadata } from "@/shared/lib/http";

vi.mock("@/shared/lib/http", () => ({
  request: vi.fn(),
  requestWithMetadata: vi.fn(),
  requestBlob: vi.fn(),
}));

const mockedRequestWithMetadata = vi.mocked(requestWithMetadata);
const mockedRequest = vi.mocked(request);

describe("quoteService.extract", () => {
  const extractionPayload = {
    transcript: "typed note only",
    pipeline_version: "v2" as const,
    line_items: [],
    pricing_hints: {
      explicit_total: null,
      deposit_amount: null,
      tax_rate: null,
      discount_type: null,
      discount_value: null,
    },
    customer_notes_suggestion: null,
    unresolved_segments: [],
    confidence_notes: [],
    extraction_tier: "primary" as const,
    extraction_degraded_reason_code: null,
  };

  afterEach(() => {
    mockedRequestWithMetadata.mockReset();
    mockedRequest.mockReset();
  });

  it("builds multipart form data with clips and trimmed notes for async extraction", async () => {
    mockedRequestWithMetadata.mockResolvedValue({
      status: 202,
      data: {
        id: "job-1",
      },
    });

    const result = await quoteService.extract({
      clips: [
        new Blob(["clip-a"], { type: "audio/mp4" }),
        new Blob(["clip-b"], { type: "audio/webm;codecs=opus" }),
      ],
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

    await quoteService.extract({
      clips: [new Blob(["clip-a"], { type: "audio/webm" })],
    });

    const [, options] = mockedRequestWithMetadata.mock.calls[0] ?? [];
    const formData = options?.body as FormData;
    expect(formData.getAll("clips")).toHaveLength(1);
    expect((formData.getAll("clips")[0] as File).name).toBe("clip-1.webm");
    expect(formData.get("notes")).toBeNull();
    expect(formData.get("customer_id")).toBeNull();
  });

  it("posts append extraction to the quote-specific endpoint", async () => {
    mockedRequestWithMetadata.mockResolvedValue({
      status: 200,
      data: {
        quote_id: "quote-22",
        ...extractionPayload,
        transcript: "append transcript",
      },
    });

    const result = await quoteService.appendExtraction("quote-22", {
      notes: "add one more item",
    });

    expect(result).toEqual({
      type: "sync",
      quoteId: "quote-22",
      result: {
        ...extractionPayload,
        transcript: "append transcript",
      },
    });

    const [path, options] = mockedRequestWithMetadata.mock.calls[0] ?? [];
    expect(path).toBe("/api/quotes/quote-22/append-extraction");
    const formData = options?.body as FormData;
    expect(formData.get("notes")).toBe("add one more item");
    expect(formData.get("customer_id")).toBeNull();
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
