import { afterEach, describe, expect, it, vi } from "vitest";

import {
  dispatchLocalRecoveryChanged,
  LOCAL_RECOVERY_CHANGED_EVENT,
  outboxStatusToLocalRecoveryReason,
  subscribeLocalRecoveryChanged,
  type LocalRecoveryChangedDetail,
} from "@/features/quotes/offline/localRecoveryEvents";

describe("localRecoveryEvents", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("maps outbox statuses to event reasons", () => {
    expect(outboxStatusToLocalRecoveryReason("queued")).toBe("outbox_queued");
    expect(outboxStatusToLocalRecoveryReason("running")).toBe("outbox_running");
    expect(outboxStatusToLocalRecoveryReason("succeeded")).toBe("outbox_succeeded");
    expect(outboxStatusToLocalRecoveryReason("failed_retryable")).toBe("outbox_failed_retryable");
    expect(outboxStatusToLocalRecoveryReason("failed_terminal")).toBe("outbox_failed_terminal");
  });

  it("filters events by user id", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLocalRecoveryChanged("user-1", listener, { debounceMs: 1 });

    dispatchLocalRecoveryChanged({
      userId: "user-2",
      sessionId: "session-2",
      reason: "capture_saved",
    });

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("uses leading-edge debounce with one trailing refresh", () => {
    vi.useFakeTimers();
    const received: LocalRecoveryChangedDetail[] = [];
    const unsubscribe = subscribeLocalRecoveryChanged(
      "user-1",
      (detail) => {
        received.push(detail);
      },
      { debounceMs: 250 },
    );

    dispatchLocalRecoveryChanged({
      userId: "user-1",
      sessionId: "session-1",
      reason: "capture_saved",
    });
    expect(received.map((event) => event.reason)).toEqual(["capture_saved"]);

    dispatchLocalRecoveryChanged({
      userId: "user-1",
      sessionId: "session-1",
      reason: "outbox_running",
    });
    dispatchLocalRecoveryChanged({
      userId: "user-1",
      sessionId: "session-1",
      reason: "outbox_succeeded",
    });

    vi.advanceTimersByTime(249);
    expect(received.map((event) => event.reason)).toEqual(["capture_saved"]);

    vi.advanceTimersByTime(1);
    expect(received.map((event) => event.reason)).toEqual(["capture_saved", "outbox_succeeded"]);

    vi.advanceTimersByTime(251);
    dispatchLocalRecoveryChanged({
      userId: "user-1",
      sessionId: "session-1",
      reason: "capture_deleted",
    });
    expect(received.map((event) => event.reason)).toEqual([
      "capture_saved",
      "outbox_succeeded",
      "capture_deleted",
    ]);

    unsubscribe();
  });

  it("dispatches typed custom events", () => {
    const listener = vi.fn();
    window.addEventListener(LOCAL_RECOVERY_CHANGED_EVENT, listener);

    dispatchLocalRecoveryChanged({
      userId: "user-1",
      sessionId: "session-1",
      reason: "capture_saved",
    });

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(LOCAL_RECOVERY_CHANGED_EVENT, listener);
  });
});
