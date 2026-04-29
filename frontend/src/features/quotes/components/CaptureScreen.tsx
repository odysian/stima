import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { useQuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";
import { EXTRACTION_STAGE_DELAY_MS, getExtractionStages } from "@/features/quotes/components/captureScreenHelpers";
import {
  clearExtractionRequestIdempotencyKey,
  isInFlightIdempotencyConflict,
  resolveExtractionRequestIdempotencyKey,
} from "@/features/quotes/components/captureScreenIdempotency";
import { hydrateCaptureDraftFromQuote } from "@/features/quotes/components/captureScreenDraftHydration";
import { markOutboxJobSucceeded, queueOutboxRetryJob } from "@/features/quotes/components/captureScreenOutbox";
import { createManualDraftForCapture } from "@/features/quotes/components/captureScreenStartBlank";
import { CaptureScreenBody } from "@/features/quotes/components/CaptureScreenBody";
import { CaptureScreenFooter } from "@/features/quotes/components/CaptureScreenFooter";
import { useCaptureExtractionKeyReset } from "@/features/quotes/components/useCaptureExtractionKeyReset";
import { pollExtractionJobUntilQuote } from "@/features/quotes/components/captureScreenPolling";
import { classifySubmitFailure } from "@/features/quotes/offline/classifySubmitFailure";
import { getLocalCaptureStatusCopy } from "@/features/quotes/offline/localCaptureStatusCopy";
import { useLocalCaptureSession } from "@/features/quotes/offline/useLocalCaptureSession";
import { resolveCaptureLaunchOrigin } from "@/features/quotes/utils/workflowNavigation";
import { MAX_VOICE_CLIPS_PER_CAPTURE, useVoiceCapture } from "@/features/quotes/hooks/useVoiceCapture";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteSourceType } from "@/features/quotes/types/quote.types";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { WorkflowScreenHeader } from "@/shared/components/WorkflowScreenHeader";
import { formatByteLimit } from "@/shared/lib/formatters";
import { MAX_AUDIO_CLIPS_PER_REQUEST, MAX_AUDIO_TOTAL_BYTES } from "@/shared/lib/inputLimits";
import { perfMark, perfMeasure, perfMeasureSincePageLoad } from "@/shared/perf";
import { useToast } from "@/ui/Toast";
const START_BLANK_GUARD_TARGET = "__start_blank__";

export function CaptureScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { show } = useToast();
  const { user } = useAuth();
  const location = useLocation();
  const { customerId } = useParams<{ customerId?: string }>();
  const { setDraft } = useQuoteDraft(user?.id);
  const isMountedRef = useRef(true);
  const extractionStageTimerRefs = useRef<number[]>([]);
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const localSessionQueryParam = searchParams.get("localSession");
  const autoExtractOnLoad = searchParams.get("autoExtract") === "1";
  const {
    notes,
    setNotes,
    sessionId: localSessionId,
    sessionStatus,
    isHydrating: isHydratingLocalSession,
    hydrationError: localHydrationError,
    saveState: localSaveState,
    saveError: localSaveError,
    ensureSession: ensureLocalCaptureSession,
    setClipIds: setLocalCaptureClipIds,
    markStatus: markLocalCaptureStatus,
  } = useLocalCaptureSession({
    userId: user?.id,
    customerId,
    initialSessionId: localSessionQueryParam,
  });
  const {
    clips,
    elapsedSeconds,
    error: voiceError,
    isRecording,
    isSupported,
    startRecording,
    stopRecording,
    removeClip,
    clearError,
  } = useVoiceCapture(localSessionId, user?.id);

  const [extractionStage, setExtractionStage] = useState<string | null>(null);
  const [pendingExitTarget, setPendingExitTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStartingBlank, setIsStartingBlank] = useState(false);
  const [isRetryLockedByInFlightExtraction, setIsRetryLockedByInFlightExtraction] = useState(false);
  const [hasAttemptedAutoExtract, setHasAttemptedAutoExtract] = useState(false);
  const extractionIdempotencyKeyRef = useRef<string | null>(null);
  const isExtracting = extractionStage !== null;
  const hasClips = clips.length > 0;
  const hasNotes = notes.trim().length > 0;
  const launchOrigin = resolveCaptureLaunchOrigin({
    customerId,
    locationState: location.state,
  });

  function clearExtractionStageTimers(): void {
    extractionStageTimerRefs.current.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    extractionStageTimerRefs.current = [];
  }

  function clearActionErrors(): void {
    setError(null);
    clearError();
    setIsRetryLockedByInFlightExtraction(false);
  }

  const dismissActiveErrorRef = useRef<() => void>(() => {});

  useEffect(() => {
    isMountedRef.current = true;
    perfMark("capture:route:mounted");
    perfMeasureSincePageLoad("capture:route:load_ms");
    return () => {
      isMountedRef.current = false;
      extractionStageTimerRefs.current.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      extractionStageTimerRefs.current = [];
    };
  }, []);

  const displayedError = error ?? localHydrationError ?? localSaveError ?? voiceError;

  useEffect(() => {
    dismissActiveErrorRef.current = () => {
      if (error) {
        setError(null);
        return;
      }
      if (localHydrationError || localSaveError) {
        return;
      }
      if (voiceError) {
        clearError();
      }
    };
  }, [clearError, error, localHydrationError, localSaveError, voiceError]);

  useEffect(() => {
    void setLocalCaptureClipIds(clips.map((clip) => clip.id));
  }, [clips, setLocalCaptureClipIds]);

  const handleNotesChange = useCaptureExtractionKeyReset({
    clips,
    notes,
    localSessionId,
    isRetryLockedByInFlightExtraction,
    setIsRetryLockedByInFlightExtraction,
    extractionIdempotencyKeyRef,
    setNotes,
  });

  useEffect(() => {
    if (!displayedError) {
      return;
    }
    show({
      message: displayedError,
      variant: "error",
      durationMs: null,
      onDismiss: () => dismissActiveErrorRef.current(),
    });
  }, [displayedError, show]);

  async function onExtract(): Promise<void> {
    // TODO(spec1): perfMark("capture:local:save_start") / perfMark("capture:local:save_done")
    clearActionErrors();
    let idempotencyKey = "";
    let extractionSessionId: string | null = null;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      ({
        idempotencyKey,
        sessionId: extractionSessionId,
      } = await resolveExtractionRequestIdempotencyKey({
        localSessionId,
        ensureLocalCaptureSession,
        extractionIdempotencyKeyRef,
      }));
      if (extractionSessionId && user?.id) {
        await queueOutboxRetryJob({
          userId: user.id,
          sessionId: extractionSessionId,
          idempotencyKey,
        });
      }
      await markLocalCaptureStatus("ready_to_extract", {
        failureKind: "offline",
      });
      setError("Ready to extract when online. Your notes are still saved on this device.");
      return;
    }
    if (clips.length > MAX_AUDIO_CLIPS_PER_REQUEST) {
      setError(
        `You can upload up to ${MAX_AUDIO_CLIPS_PER_REQUEST} clips at a time.`,
      );
      return;
    }
    const totalClipBytes = clips.reduce(
      (runningTotal, clip) => runningTotal + clip.sizeBytes,
      0,
    );
    if (totalClipBytes > MAX_AUDIO_TOTAL_BYTES) {
      setError(
        `Total audio upload must be ${formatByteLimit(MAX_AUDIO_TOTAL_BYTES)} or smaller.`,
      );
      return;
    }
    void markLocalCaptureStatus("submitting");
    perfMark("capture:extract:start");
    clearExtractionStageTimers();
    const stages = getExtractionStages(hasClips, hasNotes);
    setExtractionStage(stages[0]);
    stages.slice(1).forEach((stage, index) => {
      const timerId = window.setTimeout(
        () => {
          if (!isMountedRef.current) {
            return;
          }
          setExtractionStage(stage);
        },
        EXTRACTION_STAGE_DELAY_MS * (index + 1),
      );
      extractionStageTimerRefs.current.push(timerId);
    });

    try {
      ({
        idempotencyKey,
        sessionId: extractionSessionId,
      } = await resolveExtractionRequestIdempotencyKey({
        localSessionId,
        ensureLocalCaptureSession,
        extractionIdempotencyKeyRef,
      }));
      const extraction = await quoteService.extract({
        clipIds: clips.map((clip) => clip.id),
        notes,
        customerId,
        idempotencyKey,
      });
      await clearExtractionRequestIdempotencyKey(extractionSessionId, extractionIdempotencyKeyRef);
      perfMark("capture:extract:response");
      perfMeasure(
        "capture:extract:submit_to_response_ms",
        "capture:extract:start",
        "capture:extract:response",
      );
      if (!isMountedRef.current) {
        return;
      }
      const sourceType: QuoteSourceType = hasClips ? (hasNotes ? "voice+text" : "voice") : "text";
      if (extraction.type === "sync") {
        await markOutboxJobSucceeded({
          sessionId: extractionSessionId,
          quoteId: extraction.quoteId,
          extractJobId: null,
        });
        await markLocalCaptureStatus("synced", {
          serverQuoteId: extraction.quoteId,
          extractJobId: null,
        });
        await hydrateCaptureDraftFromQuote({
          quoteId: extraction.quoteId,
          sourceType,
          customerId,
          launchOrigin,
          setDraft,
        });
        navigate(`/documents/${extraction.quoteId}/edit`);
        return;
      }

      void markLocalCaptureStatus("submitting", {
        extractJobId: extraction.jobId,
      });
      await pollExtractionJobUntilQuote({
        jobId: extraction.jobId,
        isMounted: () => isMountedRef.current,
        onQuoteReady: async (job) => {
          if (!job.quote_id || !job.extraction_result) {
            throw new Error(
              "Extraction completed without a result. Please try again.",
            );
          }
          await markLocalCaptureStatus("synced", {
            serverQuoteId: job.quote_id,
            extractJobId: job.id,
          });
          await hydrateCaptureDraftFromQuote({
            quoteId: job.quote_id,
            sourceType,
            customerId,
            launchOrigin,
            setDraft,
          });
          navigate(`/documents/${job.quote_id}/edit`);
        },
      });
      await markOutboxJobSucceeded({
        sessionId: extractionSessionId,
        quoteId: null,
        extractJobId: extraction.jobId,
      });
    } catch (submitError) {
      if (!isMountedRef.current) {
        return;
      }
      const failureKind = classifySubmitFailure(submitError);
      const isIdempotencyInFlightConflict = isInFlightIdempotencyConflict(submitError);
      const message = isIdempotencyInFlightConflict
        ? "Extraction already in progress"
        : submitError instanceof Error
          ? submitError.message
          : "Unable to extract line items";
      await markLocalCaptureStatus("extract_failed", {
        failureKind,
        error: message,
      });
      if (
        extractionSessionId
        && user?.id
        && (failureKind === "offline"
          || failureKind === "timeout"
          || failureKind === "server_retryable"
          || failureKind === "auth_required")
      ) {
        await queueOutboxRetryJob({
          userId: user.id,
          sessionId: extractionSessionId,
          idempotencyKey,
        });
      }
      if (isIdempotencyInFlightConflict) {
        setIsRetryLockedByInFlightExtraction(true);
      }
      setError(message);
    } finally {
      const shouldResetExtractionStage = isMountedRef.current;
      clearExtractionStageTimers();
      if (shouldResetExtractionStage) {
        setExtractionStage(null);
      }
    }
  }
  async function onStartBlank(): Promise<void> {
    clearActionErrors();
    setIsStartingBlank(true);
    try {
      const manualDraftId = await createManualDraftForCapture(customerId);
      if (!isMountedRef.current) {
        return;
      }
      navigate(`/documents/${manualDraftId}/edit`);
    } catch (startBlankError) {
      if (!isMountedRef.current) {
        return;
      }
      const message =
        startBlankError instanceof Error
          ? startBlankError.message
          : "Unable to start a blank draft";
      setError(message);
    } finally {
      if (isMountedRef.current) {
        setIsStartingBlank(false);
      }
    }
  }

  const hasReachedClipLimit = clips.length >= MAX_VOICE_CLIPS_PER_CAPTURE;
  const hasUnsavedWork = clips.length > 0 || (notes.trim().length > 0
    && (localSessionId === null || localSaveState === "saving" || localSaveState === "error"));
  const canExtract = (hasClips || hasNotes) && !isExtracting && !isRecording && !isRetryLockedByInFlightExtraction;
  const localStatusCopy = localSaveState === "saving"
    ? "Saving on this device..."
    : localSaveState === "error"
      ? "Stima could not save this capture on your device. Copy your notes before leaving this screen."
      : getLocalCaptureStatusCopy(sessionStatus);
  useEffect(() => {
    setHasAttemptedAutoExtract(false);
  }, [autoExtractOnLoad, localSessionQueryParam]);
  useEffect(() => {
    if (!autoExtractOnLoad || hasAttemptedAutoExtract || isHydratingLocalSession || !canExtract) {
      return;
    }
    setHasAttemptedAutoExtract(true);
    void onExtract();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onExtract identity changes each render.
  }, [autoExtractOnLoad, canExtract, hasAttemptedAutoExtract, isHydratingLocalSession]);
  return (
    <main className="min-h-dvh bg-background">
      <WorkflowScreenHeader
        title="Capture Job Notes"
        subtitle="Describe the job and we'll extract the line items"
        backLabel="Go back"
        onBack={() => (hasUnsavedWork
          ? setPendingExitTarget(launchOrigin)
          : navigate(launchOrigin, { replace: true }))}
      />

      <CaptureScreenBody
        isSupported={isSupported}
        isExtracting={isExtracting}
        clips={clips}
        removeClip={removeClip}
        notes={notes}
        onNotesChange={handleNotesChange}
        isRecording={isRecording}
        elapsedSeconds={elapsedSeconds}
        hasReachedClipLimit={hasReachedClipLimit}
        onStartRecording={() => {
          void (async () => {
            const ensuredSessionId = await ensureLocalCaptureSession();
            await startRecording(ensuredSessionId);
          })();
        }}
        onStopRecording={stopRecording}
        onStartBlank={() => (hasUnsavedWork
          ? setPendingExitTarget(START_BLANK_GUARD_TARGET)
          : void onStartBlank())}
        isStartBlankDisabled={isExtracting || isRecording || isStartingBlank}
      />

      <CaptureScreenFooter
        extractionStage={extractionStage}
        localStatusCopy={localStatusCopy}
        canExtract={canExtract}
        isExtracting={isExtracting}
        onExtract={() => {
          void onExtract();
        }}
      />

      {pendingExitTarget ? (
        <ConfirmModal
          title="Leave this screen?"
          body="Unsaved clips or notes not yet stored on this device will be lost."
          confirmLabel="Leave"
          cancelLabel="Stay"
          onConfirm={() => {
            const nextTarget = pendingExitTarget;
            setPendingExitTarget(null);
            if (nextTarget === START_BLANK_GUARD_TARGET) {
              void onStartBlank();
              return;
            }
            navigate(nextTarget, { replace: true });
          }}
          onCancel={() => setPendingExitTarget(null)}
        />
      ) : null}
    </main>
  );
}
