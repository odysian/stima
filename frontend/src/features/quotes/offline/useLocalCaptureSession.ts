import { useCallback, useEffect, useRef, useState } from "react";

import {
  createCaptureSession,
  deleteEmptyAbandonedSessions,
  getCaptureSession,
  markCaptureStatus,
  updateCaptureField,
  updateCaptureNotes,
} from "@/features/quotes/offline/captureRepository";
import { deleteAllClipsForSession } from "@/features/quotes/offline/audioRepository";
import { getStorageErrorMessage } from "@/features/quotes/offline/captureDb";
import type {
  LocalCaptureSession,
  LocalCaptureStatus,
  SubmitFailureKind,
} from "@/features/quotes/offline/captureTypes";

const NOTES_PERSIST_DEBOUNCE_MS = 350;
const SYNCED_AUDIO_CLEANUP_DELAY_MS = 60_000;
const syncedAudioCleanupTimerBySession = new Map<string, number>();

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
  ensureSession: () => Promise<string | null>;
  setClipIds: (clipIds: string[]) => Promise<void>;
  markStatus: (status: LocalCaptureStatus, options?: MarkCaptureStatusOptions) => Promise<string | null>;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return getStorageErrorMessage(error, fallback);
}

function clearSyncedAudioCleanupTimer(sessionId: string): void {
  const timerId = syncedAudioCleanupTimerBySession.get(sessionId);
  if (timerId === undefined) {
    return;
  }
  if (typeof window !== "undefined") {
    window.clearTimeout(timerId);
  }
  syncedAudioCleanupTimerBySession.delete(sessionId);
}

function scheduleSyncedAudioCleanup(sessionId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  clearSyncedAudioCleanupTimer(sessionId);

  const timerId = window.setTimeout(() => {
    syncedAudioCleanupTimerBySession.delete(sessionId);
    void (async () => {
      try {
        await deleteAllClipsForSession(sessionId);
        await updateCaptureField(sessionId, { clipIds: [] });
      } catch {
        // Ignore cleanup retries; stale clips can still be removed manually.
      }
    })();
  }, SYNCED_AUDIO_CLEANUP_DELAY_MS);

  syncedAudioCleanupTimerBySession.set(sessionId, timerId);
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
  const pendingSessionCreationRef = useRef<Promise<LocalCaptureSession> | null>(null);

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

  const createSessionOnce = useCallback(async (
    noteSnapshot: string,
    customerSnapshot: string | null,
  ): Promise<LocalCaptureSession> => {
    if (!userId) {
      throw new Error("Cannot create a local capture session without a user.");
    }

    const existingSession = sessionRef.current;
    if (existingSession) {
      return existingSession;
    }

    const pendingCreation = pendingSessionCreationRef.current;
    if (pendingCreation) {
      return pendingCreation;
    }

    const creationPromise = createCaptureSession({
      userId,
      notes: noteSnapshot,
      customerId: customerSnapshot,
    });
    pendingSessionCreationRef.current = creationPromise;

    try {
      const createdSession = await creationPromise;
      if (isMountedRef.current) {
        setSession(createdSession);
        setSaveState("saved");
        setSaveError(null);
      }
      return createdSession;
    } finally {
      if (pendingSessionCreationRef.current === creationPromise) {
        pendingSessionCreationRef.current = null;
      }
    }
  }, [userId]);

  const ensureSessionRecord = useCallback(async (): Promise<LocalCaptureSession | null> => {
    if (!userId) {
      return null;
    }

    let targetSession = sessionRef.current;
    if (targetSession) {
      return targetSession;
    }

    targetSession = await createSessionOnce(notesRef.current, customerId ?? null);

    return targetSession;
  }, [createSessionOnce, customerId, userId]);

  const ensureSession = useCallback(async (): Promise<string | null> => {
    const targetSession = await ensureSessionRecord();
    return targetSession?.sessionId ?? null;
  }, [ensureSessionRecord]);

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

        if (
          loadedSession.status === "synced" &&
          loadedSession.serverQuoteId &&
          loadedSession.clipIds.length > 0
        ) {
          scheduleSyncedAudioCleanup(loadedSession.sessionId);
        }

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
            targetSession = await createSessionOnce(noteSnapshot, customerSnapshot);

            if (!isMountedRef.current) {
              return;
            }
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
  }, [clearPersistTimer, createSessionOnce, customerId, isHydrating, notes, userId]);

  const setClipIds = useCallback(async (clipIds: string[]): Promise<void> => {
    const normalizedClipIds = Array.from(new Set(clipIds));
    let targetSession = sessionRef.current;

    if (!targetSession && normalizedClipIds.length > 0) {
      targetSession = await ensureSessionRecord();
    }

    if (!targetSession) {
      return;
    }

    await updateCaptureField(targetSession.sessionId, {
      clipIds: normalizedClipIds,
    });

    const refreshedSession = await getCaptureSession(targetSession.sessionId);
    if (!isMountedRef.current) {
      return;
    }

    if (refreshedSession) {
      setSession(refreshedSession);
    }
    setSaveState("saved");
    setSaveError(null);
  }, [ensureSessionRecord]);

  const markStatus = useCallback(async (
    status: LocalCaptureStatus,
    options?: MarkCaptureStatusOptions,
  ): Promise<string | null> => {
    const targetSession = await ensureSessionRecord();
    if (!targetSession) {
      return null;
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
      return targetSession.sessionId;
    }

    if (refreshedSession) {
      setSession(refreshedSession);
    }
    setSaveState("saved");
    setSaveError(null);

    if (status === "synced" && options?.serverQuoteId) {
      scheduleSyncedAudioCleanup(targetSession.sessionId);
    }

    return targetSession.sessionId;
  }, [ensureSessionRecord]);

  return {
    notes,
    setNotes: setNotesState,
    sessionId: session?.sessionId ?? null,
    sessionStatus: session?.status ?? null,
    isHydrating,
    hydrationError,
    saveState,
    saveError,
    ensureSession,
    setClipIds,
    markStatus,
  };
}
