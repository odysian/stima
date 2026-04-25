import { getLocalCaptureStatusCopy } from "@/features/quotes/offline/localCaptureStatusCopy";
import type { LocalCaptureSummary } from "@/features/quotes/offline/captureTypes";
import { Button } from "@/shared/components/Button";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { formatDate } from "@/shared/lib/formatters";
import { Eyebrow } from "@/ui/Eyebrow";

interface PendingCapturesSectionProps {
  captures: LocalCaptureSummary[];
  isLoading: boolean;
  isOnline: boolean;
  timezone: string | null;
  error: string | null;
  onResume: (sessionId: string) => void;
  onExtract: (sessionId: string) => void;
  onRetry: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
}

function buildCaptureSummaryLabel(notes: string): string {
  const trimmedNotes = notes.trim();
  if (trimmedNotes.length === 0) {
    return "Untitled capture";
  }

  const firstLine = trimmedNotes.split("\n", 1)[0] ?? trimmedNotes;
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
}

function buildClipCountLabel(clipCount: number): string {
  return `${clipCount} voice clip${clipCount === 1 ? "" : "s"}`;
}

function buildCustomerLabel(capture: LocalCaptureSummary): string {
  const customerName = capture.customerSnapshot?.name?.trim();
  if (customerName) {
    return customerName;
  }
  if (capture.customerId) {
    return "Saved customer";
  }
  return "No customer selected";
}

function buildPendingCaptureStatusCopy(capture: LocalCaptureSummary, isOnline: boolean): string {
  if (capture.outboxStatus === "running") {
    const attemptCount = Math.max(capture.outboxAttemptCount ?? 1, 1);
    const maxAttempts = Math.max(capture.outboxMaxAttempts ?? 5, 1);
    return `Syncing... attempt ${attemptCount} of ${maxAttempts}.`;
  }

  if (capture.outboxStatus === "failed_retryable") {
    return "Still saved. Retry now or wait for Stima to try again.";
  }

  if (capture.outboxStatus === "failed_terminal") {
    return "Still saved, but automatic sync stopped. Open to review or delete.";
  }

  if (capture.status === "extract_failed") {
    if (!isOnline || capture.lastFailureKind === "offline") {
      return "Still saved. Connect to sync this capture.";
    }

    if (capture.lastFailureKind === "timeout" || capture.lastFailureKind === "server_retryable") {
      return "Still saved. Stima will retry when the connection improves.";
    }

    if (capture.lastFailureKind === "auth_required" || capture.lastFailureKind === "csrf_failed") {
      return "Still saved. Sign in again to sync.";
    }

    if (capture.lastFailureKind === "validation_failed") {
      return "Still saved. Open and edit before retrying.";
    }

    if (capture.lastFailureKind === "server_terminal") {
      return "Still saved. Open to review or delete.";
    }
  }

  return getLocalCaptureStatusCopy(capture.status) ?? "Saved on this device.";
}

export function PendingCapturesSection({
  captures,
  isLoading,
  isOnline,
  timezone,
  error,
  onResume,
  onExtract,
  onRetry,
  onDelete,
}: PendingCapturesSectionProps): React.ReactElement {
  return (
    <section aria-label="Pending captures" className="mb-4 px-4">
      <div className="ghost-shadow rounded-[var(--radius-document)] border border-outline-variant/20 bg-surface-container-low p-4">
        <div className="mb-3 flex items-center justify-between">
          <Eyebrow className="text-on-surface">PENDING CAPTURES</Eyebrow>
          <Eyebrow
            as="span"
            className="rounded-full bg-surface-container-lowest px-2.5 py-1 tracking-widest"
          >
            {captures.length}
          </Eyebrow>
        </div>
        {error ? (
          <div className="mb-3">
            <FeedbackMessage variant="error">{error}</FeedbackMessage>
          </div>
        ) : null}
        {isLoading ? (
          <p className="text-sm text-on-surface-variant">Loading pending captures...</p>
        ) : null}
        {!isLoading && captures.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No pending captures yet.</p>
        ) : null}
        {!isLoading && captures.length > 0 ? (
          <ul className="space-y-3">
            {captures.map((capture) => (
              <li
                key={capture.sessionId}
                className="rounded-[var(--radius-document)] bg-surface-container-lowest p-3"
              >
                <p className="text-sm font-semibold text-on-surface">
                  {buildCaptureSummaryLabel(capture.notes)}
                </p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  Customer: {buildCustomerLabel(capture)}
                </p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  {buildClipCountLabel(capture.clipCount)}
                </p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  Status: {buildPendingCaptureStatusCopy(capture, isOnline)}
                </p>
                <p className="mt-1 text-xs text-outline">
                  Updated {formatDate(capture.updatedAt, timezone)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="tonal"
                    onClick={() => onResume(capture.sessionId)}
                    aria-label={`Resume pending capture ${buildCaptureSummaryLabel(capture.notes)}`}
                  >
                    Resume
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!isOnline || capture.outboxStatus === "running"}
                    onClick={() => (
                      capture.outboxStatus === "failed_retryable"
                        ? onRetry(capture.sessionId)
                        : onExtract(capture.sessionId)
                    )}
                    aria-label={`${
                      capture.outboxStatus === "failed_retryable" ? "Retry" : "Extract"
                    } pending capture ${buildCaptureSummaryLabel(capture.notes)}`}
                  >
                    {capture.outboxStatus === "running"
                      ? "Syncing..."
                      : capture.outboxStatus === "failed_retryable"
                        ? "Retry"
                        : "Extract"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete(capture.sessionId)}
                    aria-label={`Delete pending capture ${buildCaptureSummaryLabel(capture.notes)}`}
                  >
                    Delete
                  </Button>
                </div>
                {!isOnline ? (
                  <p className="mt-2 text-xs text-on-surface-variant">
                    Connect to the internet to use Extract or Retry.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
