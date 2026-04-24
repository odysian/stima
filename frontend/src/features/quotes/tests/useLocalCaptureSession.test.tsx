import "fake-indexeddb/auto";

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCaptureSession, getCaptureSession, listRecoverableCaptures } from "@/features/quotes/offline/captureRepository";
import { resetCaptureDbForTests } from "@/features/quotes/offline/captureDb";
import { useLocalCaptureSession } from "@/features/quotes/offline/useLocalCaptureSession";

describe("useLocalCaptureSession", () => {
  beforeEach(async () => {
    await resetCaptureDbForTests();
  });

  afterEach(async () => {
    await resetCaptureDbForTests();
  });

  it("persists notes lazily after meaningful input", async () => {
    const { result } = renderHook(() => useLocalCaptureSession({
      userId: "user-1",
      customerId: "cust-1",
      initialSessionId: null,
    }));

    expect(result.current.sessionId).toBeNull();
    await waitFor(() => {
      expect(result.current.isHydrating).toBe(false);
    });

    act(() => {
      result.current.setNotes("Install sod in backyard");
    });

    await waitFor(() => {
      expect(result.current.sessionId).not.toBeNull();
      expect(result.current.saveState).toBe("saved");
    });

    const persistedSession = await getCaptureSession(result.current.sessionId ?? "");
    expect(persistedSession?.notes).toBe("Install sod in backyard");
    expect(persistedSession?.userId).toBe("user-1");
  });

  it("does not create a recoverable session for an untouched draft", async () => {
    const { result } = renderHook(() => useLocalCaptureSession({
      userId: "user-1",
      customerId: undefined,
      initialSessionId: null,
    }));

    await waitFor(() => {
      expect(result.current.isHydrating).toBe(false);
    });

    expect(result.current.sessionId).toBeNull();
    await expect(listRecoverableCaptures("user-1")).resolves.toEqual([]);
  });

  it("hydrates a saved session from query param for same user", async () => {
    const existingSession = await createCaptureSession({
      userId: "user-1",
      notes: "Patio estimate",
      customerId: "cust-1",
    });

    const { result } = renderHook(() => useLocalCaptureSession({
      userId: "user-1",
      customerId: "cust-1",
      initialSessionId: existingSession.sessionId,
    }));

    await waitFor(() => {
      expect(result.current.isHydrating).toBe(false);
      expect(result.current.sessionId).toBe(existingSession.sessionId);
      expect(result.current.notes).toBe("Patio estimate");
    });
  });

  it("hides local sessions that belong to another user", async () => {
    const otherUsersSession = await createCaptureSession({
      userId: "user-a",
      notes: "Other account note",
      customerId: "cust-a",
    });

    const { result } = renderHook(() => useLocalCaptureSession({
      userId: "user-b",
      customerId: undefined,
      initialSessionId: otherUsersSession.sessionId,
    }));

    await waitFor(() => {
      expect(result.current.isHydrating).toBe(false);
    });

    expect(result.current.sessionId).toBeNull();
    expect(result.current.notes).toBe("");
    expect(result.current.hydrationError).toBe("Pending capture was not found for this account.");
  });
});
