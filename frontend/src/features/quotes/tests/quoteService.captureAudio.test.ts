import { describe, expect, it, vi } from "vitest";

import { quoteService } from "@/features/quotes/services/quoteService";
import { request } from "@/shared/lib/http";

vi.mock("@/shared/lib/http", () => ({
  request: vi.fn(),
  requestBlob: vi.fn(),
}));

const mockedRequest = vi.mocked(request);

describe("quoteService.captureAudio", () => {
  it("builds multipart form data with repeated clips fields", async () => {
    mockedRequest.mockResolvedValue({
      transcript: "voice transcript",
      line_items: [],
      total: null,
      confidence_notes: [],
    });

    const clipA = new Blob(["clip-a"], { type: "audio/webm" });
    const clipB = new Blob(["clip-b"], { type: "audio/webm" });

    await quoteService.captureAudio([clipA, clipB]);

    expect(mockedRequest).toHaveBeenCalledTimes(1);
    const [path, options] = mockedRequest.mock.calls[0] ?? [];

    expect(path).toBe("/api/quotes/capture-audio");
    expect(options?.method).toBe("POST");

    const formData = options?.body;
    expect(formData).toBeInstanceOf(FormData);

    const clips = (formData as FormData).getAll("clips");
    expect(clips).toHaveLength(2);
  });
});
