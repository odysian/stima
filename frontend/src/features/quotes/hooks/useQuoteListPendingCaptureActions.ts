import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getStorageErrorMessage } from "@/features/quotes/offline/captureDb";
import { runOutboxPass } from "@/features/quotes/offline/outboxEngine";
import { getJobForSession, updateJobStatus } from "@/features/quotes/offline/outboxRepository";

interface UseQuoteListPendingCaptureActionsArgs {
  userId: string | undefined;
  deleteCapture: (sessionId: string) => Promise<void>;
  refreshRecoverableCaptures: () => Promise<void>;
}

interface UseQuoteListPendingCaptureActionsResult {
  pendingCaptureActionError: string | null;
  clearPendingCaptureActionError: () => void;
  navigateToLocalCapture: (sessionId: string, options?: { autoExtract?: boolean }) => void;
  onDeleteCapture: (sessionId: string) => Promise<void>;
  onRetryCapture: (sessionId: string) => Promise<void>;
}

export function useQuoteListPendingCaptureActions({
  userId,
  deleteCapture,
  refreshRecoverableCaptures,
}: UseQuoteListPendingCaptureActionsArgs): UseQuoteListPendingCaptureActionsResult {
  const navigate = useNavigate();
  const [pendingCaptureActionError, setPendingCaptureActionError] = useState<string | null>(null);

  function clearPendingCaptureActionError(): void {
    setPendingCaptureActionError(null);
  }

  function navigateToLocalCapture(sessionId: string, options?: { autoExtract?: boolean }): void {
    const nextSearchParams = new URLSearchParams({ localSession: sessionId });
    if (options?.autoExtract) {
      nextSearchParams.set("autoExtract", "1");
    }
    navigate(`/quotes/capture?${nextSearchParams.toString()}`);
  }

  async function onDeleteCapture(sessionId: string): Promise<void> {
    setPendingCaptureActionError(null);
    try {
      await deleteCapture(sessionId);
    } catch (deleteError) {
      const message = getStorageErrorMessage(deleteError, "Unable to delete pending capture.");
      setPendingCaptureActionError(message);
    }
  }

  async function onRetryCapture(sessionId: string): Promise<void> {
    if (!userId) {
      return;
    }

    setPendingCaptureActionError(null);
    try {
      const outboxJob = await getJobForSession(sessionId);
      if (!outboxJob || outboxJob.status === "running") {
        return;
      }

      await updateJobStatus(outboxJob.jobId, {
        status: "queued",
        nextRetryAt: null,
      });
      await runOutboxPass(userId);
      await refreshRecoverableCaptures();
    } catch (retryError) {
      const message = getStorageErrorMessage(retryError, "Unable to retry pending capture.");
      setPendingCaptureActionError(message);
    }
  }

  return {
    pendingCaptureActionError,
    clearPendingCaptureActionError,
    navigateToLocalCapture,
    onDeleteCapture,
    onRetryCapture,
  };
}
