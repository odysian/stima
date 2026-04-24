import "fake-indexeddb/auto";

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCaptureSession } from "@/features/quotes/offline/captureRepository";
import { resetCaptureDbForTests } from "@/features/quotes/offline/captureDb";
import { useRecoverableCaptures } from "@/features/quotes/offline/useRecoverableCaptures";

describe("useRecoverableCaptures", () => {
  beforeEach(async () => {
    await resetCaptureDbForTests();
  });

  afterEach(async () => {
    await resetCaptureDbForTests();
  });

  it("limits returned captures to latest 20", async () => {
    for (let index = 0; index < 25; index += 1) {
      await createCaptureSession({
        userId: "user-1",
        notes: `session-${index}`,
      });
    }

    const { result } = renderHook(() => useRecoverableCaptures("user-1"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.captures).toHaveLength(20);
    });
  });

  it("deletes a capture from the hook state", async () => {
    const session = await createCaptureSession({
      userId: "user-1",
      notes: "to-delete",
    });

    const { result } = renderHook(() => useRecoverableCaptures("user-1"));

    await waitFor(() => {
      expect(result.current.captures.some((capture) => capture.sessionId === session.sessionId)).toBe(true);
    });

    await act(async () => {
      await result.current.deleteCapture(session.sessionId);
    });

    await waitFor(() => {
      expect(result.current.captures.some((capture) => capture.sessionId === session.sessionId)).toBe(false);
    });
  });
});
