import { useEffect, useRef } from "react";

import type { PdfArtifact } from "@/features/quotes/types/quote.types";
import {
  isJobPollingAbortedError,
  pollJobUntilCompletion,
} from "@/shared/lib/jobPolling";

interface UsePendingPdfArtifactResumeOptions {
  artifact: PdfArtifact | null | undefined;
  enabled?: boolean;
  getJobStatus: (jobId: string) => Promise<{ status: string }>;
  onCompletion: () => Promise<void>;
  onError: (message: string) => void;
  timeoutErrorMessage: string;
}

export function usePendingPdfArtifactResume({
  artifact,
  enabled = true,
  getJobStatus,
  onCompletion,
  onError,
  timeoutErrorMessage,
}: UsePendingPdfArtifactResumeOptions): void {
  const activeJobIdRef = useRef<string | null>(null);
  const getJobStatusRef = useRef(getJobStatus);
  const onCompletionRef = useRef(onCompletion);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    getJobStatusRef.current = getJobStatus;
    onCompletionRef.current = onCompletion;
    onErrorRef.current = onError;
  }, [getJobStatus, onCompletion, onError]);

  useEffect(() => {
    if (!enabled || artifact?.status !== "pending" || !artifact.job_id) {
      return;
    }

    const jobId = artifact.job_id;
    if (activeJobIdRef.current === jobId) {
      return;
    }

    const controller = new AbortController();
    let isActive = true;
    activeJobIdRef.current = jobId;

    void (async () => {
      try {
        await pollJobUntilCompletion({
          jobId,
          getJobStatus: (nextJobId) => getJobStatusRef.current(nextJobId),
          timeoutErrorMessage,
          signal: controller.signal,
        });
        if (!isActive) {
          return;
        }
        await onCompletionRef.current();
      } catch (error) {
        if (!isActive || isJobPollingAbortedError(error)) {
          return;
        }

        const message = error instanceof Error ? error.message : timeoutErrorMessage;
        onErrorRef.current(message);
      } finally {
        if (activeJobIdRef.current === jobId) {
          activeJobIdRef.current = null;
        }
      }
    })();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [
    artifact?.job_id,
    artifact?.status,
    enabled,
    timeoutErrorMessage,
  ]);
}
