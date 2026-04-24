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

export function PendingCapturesSection({
  captures,
  isLoading,
  isOnline,
  timezone,
  error,
  onResume,
  onExtract,
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
                  {getLocalCaptureStatusCopy(capture.status) ?? "Saved on this device"}
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
                  >
                    Resume
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!isOnline}
                    onClick={() => onExtract(capture.sessionId)}
                  >
                    Extract
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete(capture.sessionId)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
