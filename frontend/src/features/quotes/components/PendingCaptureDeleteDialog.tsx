import type { LocalCaptureSummary } from "@/features/quotes/offline/captureTypes";
import { ConfirmModal } from "@/shared/components/ConfirmModal";

interface PendingCaptureDeleteDialogProps {
  capture: LocalCaptureSummary | null;
  onCancel: () => void;
  onConfirm: (sessionId: string) => void;
}

function buildDeleteBody(capture: LocalCaptureSummary): string {
  if (capture.clipCount > 0) {
    return `This removes the saved notes and ${capture.clipCount} voice clip${
      capture.clipCount === 1 ? "" : "s"
    } from this device. This cannot be undone.`;
  }
  return "This removes the saved notes from this device. This cannot be undone.";
}

export function PendingCaptureDeleteDialog({
  capture,
  onCancel,
  onConfirm,
}: PendingCaptureDeleteDialogProps): React.ReactElement | null {
  if (!capture) {
    return null;
  }

  return (
    <ConfirmModal
      title="Delete pending capture?"
      body={buildDeleteBody(capture)}
      confirmLabel="Delete"
      cancelLabel="Keep"
      variant="destructive"
      onCancel={onCancel}
      onConfirm={() => onConfirm(capture.sessionId)}
    />
  );
}
