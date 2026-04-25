import type { LocalCaptureStatus } from "@/features/quotes/offline/captureTypes";

const LOCAL_CAPTURE_STATUS_COPY: Record<LocalCaptureStatus, string> = {
  local_only: "Saved on this device.",
  ready_to_extract: "Ready to sync when you're online.",
  submitting: "Syncing to a quote draft...",
  extract_failed: "Still saved. Open to review or delete.",
  synced: "Synced to quote draft.",
  discarded: "Discarded",
};

export function getLocalCaptureStatusCopy(status: LocalCaptureStatus | null | undefined): string | null {
  if (!status) {
    return null;
  }
  return LOCAL_CAPTURE_STATUS_COPY[status] ?? null;
}
