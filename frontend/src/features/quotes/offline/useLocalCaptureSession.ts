import { useCallback, useEffect, useRef, useState } from "react";

import {
  createCaptureSession,
  deleteEmptyAbandonedSessions,
  getCaptureSession,
  markCaptureStatus,
  updateCaptureField,
  updateCaptureNotes,
} from "@/features/quotes/offline/captureRepository";
import type {
  LocalCaptureSession,
  LocalCaptureStatus,
  SubmitFailureKind,
} from "@/features/quotes/offline/captureTypes";

const NOTES_PERSIST_DEBOUNCE_MS = 350;

type LocalSaveState = "idle" | "saving" | "saved" | "error";

interface MarkCaptureStatusOptions {
  failureKind?: SubmitFailureKind;
  error?: string;
  serverQuoteId?: string | null;
  extractJobId?: string | null;
}

interface UseLocalCaptureSessionParams {
  userId: string | undefined;
  customerId: string | undefined;
  initialSessionId: string | null;
}

interface UseLocalCaptureSessionResult {
  notes: string;
  setNotes: (value: string) => void;
  sessionId: string | null;
  sessionStatus: LocalCaptureStatus | null;
  isHydrating: boolean;
  hydrationError: string | null;
  saveState: LocalSaveState;
  saveError: string | null;
  markStatus: (status: LocalCaptureStatus, options?: MarkCaptureStatusOptions) => Promise<void>;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useLocalCaptureSession({
  userId,
  customerId,
  initialSessionId,
}: UseLocalCaptureSessionParams): UseLocalCaptureSessionResult {
  const [notes, setNotesState] = useState("");
  const [session, setSession] = useState<LocalCaptureSession | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<LocalSaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const isMountedRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);
  const notesRef = useRef(notes);
  const sessionRef = useRef<LocalCaptureSession | null>(session);

  const clearPersistTimer = useCallback((): void => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearPersistTimer();
    };
  }, [clearPersistTimer]);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    let isActive = true;

    setIsHydrating(true);
    setHydrationError(null);
    setSaveError(null);
    setSaveState("idle");
    clearPersistTimer();

    async function hydrateLocalSession(): Promise<void> {
      if (!userId) {
        if (!isActive) {
          return;
        }

        setSession(null);
        setNotesState("");
        setIsHydrating(false);
        return;
      }

      try {
        await deleteEmptyAbandonedSessions(userId);

        if (!initialSessionId) {
          if (!isActive) {
            return;
          }

          setSession(null);
          setNotesState("");
          return;
        }

        const loadedSession = await getCaptureSession(initialSessionId);
        if (!isActive) {
          return;
        }

        if (!loadedSession || loadedSession.userId !== userId) {
          setSession(null);
          setNotesState("");
          setHydrationError("Pending capture was not found for this account.");
          return;
        }

        setSession(loadedSession);
        setNotesState(loadedSession.notes);

        await updateCaptureField(loadedSession.sessionId, {
          lastOpenedAt: new Date().toISOString(),
        });

        const refreshedSession = await getCaptureSession(loadedSession.sessionId);
        if (isActive && refreshedSession) {
          setSession(refreshedSession);
        }
      } catch (loadError) {
        if (!isActive) {
          return;
        }
        setHydrationError(getErrorMessage(loadError, "Unable to load local capture."));
      } finally {
        if (isActive) {
          setIsHydrating(false);
        }
      }
    }

    void hydrateLocalSession();

    return () => {
      isActive = false;
    };
  }, [clearPersistTimer, initialSessionId, userId]);

  useEffect(() => {
    if (isHydrating || !userId) {
      return;
    }

    const hasSession = sessionRef.current !== null;
    const hasMeaningfulNotes = notes.trim().length > 0;

    if (!hasSession && !hasMeaningfulNotes) {
      setSaveState("idle");
      return;
    }

    setSaveState("saving");
    setSaveError(null);
    clearPersistTimer();

    persistTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          let targetSession = sessionRef.current;
          const noteSnapshot = notesRef.current;
          const customerSnapshot = customerId ?? null;

          if (!targetSession) {
            targetSession = await createCaptureSession({
              userId,
              notes: noteSnapshot,
              customerId: customerSnapshot,
            });

            if (!isMountedRef.current) {
              return;
            }
            setSession(targetSession);
          }

          if ((targetSession.customerId ?? null) !== customerSnapshot) {
            await updateCaptureField(targetSession.sessionId, {
              customerId: customerSnapshot,
            });
          }

          await updateCaptureNotes(targetSession.sessionId, noteSnapshot);
          const refreshedSession = await getCaptureSession(targetSession.sessionId);

          if (!isMountedRef.current) {
            return;
          }

          if (refreshedSession) {
            setSession(refreshedSession);
          }
          setSaveState("saved");
        } catch (persistError) {
          if (!isMountedRef.current) {
            return;
          }

          setSaveState("error");
          setSaveError(getErrorMessage(persistError, "Unable to save notes on this device."));
        }
      })();
    }, NOTES_PERSIST_DEBOUNCE_MS);

    return clearPersistTimer;
  }, [clearPersistTimer, customerId, isHydrating, notes, userId]);

  const markStatus = useCallback(async (
    status: LocalCaptureStatus,
    options?: MarkCaptureStatusOptions,
  ): Promise<void> => {
    if (!userId) {
      return;
    }

    const noteSnapshot = notesRef.current;
    let targetSession = sessionRef.current;

    if (!targetSession) {
      const hasMeaningfulNotes = noteSnapshot.trim().length > 0;
      const hasCustomerContext = typeof customerId === "string" && customerId.length > 0;

      if (!hasMeaningfulNotes && !hasCustomerContext) {
        return;
      }

      targetSession = await createCaptureSession({
        userId,
        notes: noteSnapshot,
        customerId: customerId ?? null,
      });

      if (!isMountedRef.current) {
        return;
      }
      setSession(targetSession);
    }

    await markCaptureStatus(targetSession.sessionId, status, {
      failureKind: options?.failureKind,
      error: options?.error,
    });

    const sessionPatch: Partial<LocalCaptureSession> = {};
    if (options?.serverQuoteId !== undefined) {
      sessionPatch.serverQuoteId = options.serverQuoteId;
    }
    if (options?.extractJobId !== undefined) {
      sessionPatch.extractJobId = options.extractJobId;
    }
    if (Object.keys(sessionPatch).length > 0) {
      await updateCaptureField(targetSession.sessionId, sessionPatch);
    }

    const refreshedSession = await getCaptureSession(targetSession.sessionId);
    if (!isMountedRef.current) {
      return;
    }

    if (refreshedSession) {
      setSession(refreshedSession);
    }
    setSaveState("saved");
    setSaveError(null);
  }, [customerId, userId]);

  return {
    notes,
    setNotes: setNotesState,
    sessionId: session?.sessionId ?? null,
    sessionStatus: session?.status ?? null,
    isHydrating,
    hydrationError,
    saveState,
    saveError,
    markStatus,
  };
}
