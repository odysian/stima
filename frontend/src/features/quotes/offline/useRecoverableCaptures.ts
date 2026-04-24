import { useCallback, useEffect, useState } from "react";

import {
  deleteCaptureSession,
  deleteEmptyAbandonedSessions,
  listRecoverableCaptures,
} from "@/features/quotes/offline/captureRepository";
import type { LocalCaptureSummary } from "@/features/quotes/offline/captureTypes";

const MAX_RECOVERABLE_CAPTURES = 20;

interface UseRecoverableCapturesResult {
  captures: LocalCaptureSummary[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  deleteCapture: (sessionId: string) => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load pending captures.";
}

export function useRecoverableCaptures(userId: string | undefined): UseRecoverableCapturesResult {
  const [captures, setCaptures] = useState<LocalCaptureSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!userId) {
      setCaptures([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await deleteEmptyAbandonedSessions(userId);
      const nextCaptures = await listRecoverableCaptures(userId);
      setCaptures(nextCaptures.slice(0, MAX_RECOVERABLE_CAPTURES));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const deleteCapture = useCallback(async (sessionId: string): Promise<void> => {
    await deleteCaptureSession(sessionId);
    setCaptures((currentCaptures) => currentCaptures.filter((capture) => capture.sessionId !== sessionId));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    captures,
    isLoading,
    error,
    refresh,
    deleteCapture,
  };
}
