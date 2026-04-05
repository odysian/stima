import { afterEach, describe, expect, it, vi } from "vitest";

import { quoteService } from "@/features/quotes/services/quoteService";
import { requestWithMetadata } from "@/shared/lib/http";

vi.mock("@/shared/lib/http", () => ({
  request: vi.fn(),
  requestWithMetadata: vi.fn(),
  requestBlob: vi.fn(),
}));

const mockedRequestWithMetadata = vi.mocked(requestWithMetadata);

describe("quoteService.extract", () => {
  afterEach(() => {
    mockedRequestWithMetadata.mockReset();
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
  });

  it("sends notes without clips for notes-only extraction", async () => {
    mockedRequestWithMetadata.mockResolvedValue({
      status: 200,
      data: {
        transcript: "typed note only",
        line_items: [],
        total: null,
        confidence_notes: [],
      },
    });

    const result = await quoteService.extract({ notes: "typed note only" });

    expect(result).toEqual({
      type: "sync",
      result: {
        transcript: "typed note only",
        line_items: [],
        total: null,
        confidence_notes: [],
      },
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
        transcript: "clips only",
        line_items: [],
        total: null,
        confidence_notes: [],
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
  });
});
