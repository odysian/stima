import type { OutboxJobStatus } from "@/features/quotes/offline/captureTypes";

export const LOCAL_RECOVERY_CHANGED_EVENT = "stima:local-recovery-changed";
const DEFAULT_DEBOUNCE_MS = 250;

export type LocalRecoveryChangedReason =
  | "capture_saved"
  | "capture_deleted"
  | "outbox_queued"
  | "outbox_running"
  | "outbox_succeeded"
  | "outbox_failed_retryable"
  | "outbox_failed_terminal";

export interface LocalRecoveryChangedDetail {
  userId: string;
  sessionId?: string;
  reason: LocalRecoveryChangedReason;
}

export function outboxStatusToLocalRecoveryReason(status: OutboxJobStatus): LocalRecoveryChangedReason {
  if (status === "queued") {
    return "outbox_queued";
  }
  if (status === "running") {
    return "outbox_running";
  }
  if (status === "succeeded") {
    return "outbox_succeeded";
  }
  if (status === "failed_retryable") {
    return "outbox_failed_retryable";
  }
  return "outbox_failed_terminal";
}

export function dispatchLocalRecoveryChanged(detail: LocalRecoveryChangedDetail): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<LocalRecoveryChangedDetail>(LOCAL_RECOVERY_CHANGED_EVENT, {
      detail,
    }),
  );
}

export function subscribeLocalRecoveryChanged(
  userId: string,
  listener: (detail: LocalRecoveryChangedDetail) => void,
  options?: { debounceMs?: number },
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const debouncedListener = createLeadingEdgeDebouncedListener(
    listener,
    options?.debounceMs ?? DEFAULT_DEBOUNCE_MS,
  );

  const eventListener: EventListener = (event) => {
    if (!(event instanceof CustomEvent)) {
      return;
    }

    const detail = event.detail;
    if (!isLocalRecoveryChangedDetail(detail) || detail.userId !== userId) {
      return;
    }

    debouncedListener.enqueue(detail);
  };

  window.addEventListener(LOCAL_RECOVERY_CHANGED_EVENT, eventListener);

  return () => {
    window.removeEventListener(LOCAL_RECOVERY_CHANGED_EVENT, eventListener);
    debouncedListener.cancel();
  };
}

function createLeadingEdgeDebouncedListener(
  listener: (detail: LocalRecoveryChangedDetail) => void,
  debounceMs: number,
): {
  enqueue: (detail: LocalRecoveryChangedDetail) => void;
  cancel: () => void;
} {
  let windowStartMs = 0;
  let trailingTimer: number | null = null;
  let queuedDetail: LocalRecoveryChangedDetail | null = null;

  const runListener = (detail: LocalRecoveryChangedDetail): void => {
    windowStartMs = Date.now();
    listener(detail);
  };

  const cancelTimer = (): void => {
    if (trailingTimer === null) {
      return;
    }

    window.clearTimeout(trailingTimer);
    trailingTimer = null;
  };

  return {
    enqueue(detail: LocalRecoveryChangedDetail): void {
      const nowMs = Date.now();
      const outsideDebounceWindow = windowStartMs === 0 || nowMs - windowStartMs >= debounceMs;

      if (outsideDebounceWindow) {
        cancelTimer();
        queuedDetail = null;
        runListener(detail);
        return;
      }

      queuedDetail = detail;
      if (trailingTimer !== null) {
        return;
      }

      const remainingMs = Math.max(debounceMs - (nowMs - windowStartMs), 0);
      trailingTimer = window.setTimeout(() => {
        trailingTimer = null;
        if (!queuedDetail) {
          return;
        }

        const nextDetail = queuedDetail;
        queuedDetail = null;
        runListener(nextDetail);
      }, remainingMs);
    },
    cancel(): void {
      cancelTimer();
      queuedDetail = null;
    },
  };
}

function isLocalRecoveryChangedDetail(value: unknown): value is LocalRecoveryChangedDetail {
  if (!value || typeof value !== "object") {
    return false;
  }

  const detail = value as Record<string, unknown>;
  return (
    typeof detail.userId === "string"
    && typeof detail.reason === "string"
    && (detail.sessionId === undefined || typeof detail.sessionId === "string")
  );
}
