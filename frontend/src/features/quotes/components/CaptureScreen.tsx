import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { useQuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";
import {
  EXTRACTION_MAX_POLLS,
  EXTRACTION_POLL_INTERVAL_MS,
  EXTRACTION_STAGE_DELAY_MS,
  getAppendHelperCopy,
  getExtractionHelperCopy,
  getExtractionStages,
} from "@/features/quotes/components/captureScreenHelpers";
import { CaptureInputPanel } from "@/features/quotes/components/CaptureInputPanel";
import {
  HOME_ROUTE,
  readCaptureLaunchOrigin,
  resolveCaptureLaunchOrigin,
} from "@/features/quotes/utils/workflowNavigation";
import {
  readQuoteConfidenceNotes,
  writeQuoteConfidenceNotes,
} from "@/features/quotes/utils/reviewConfidenceNotes";
import { useVoiceCapture } from "@/features/quotes/hooks/useVoiceCapture";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { ExtractionResult, QuoteSourceType } from "@/features/quotes/types/quote.types";
import { Button } from "@/shared/components/Button";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { ScreenFooter } from "@/shared/components/ScreenFooter";
import { Toast } from "@/shared/components/Toast";
import { WorkflowScreenHeader } from "@/shared/components/WorkflowScreenHeader";
import { jobService } from "@/shared/lib/jobService";
import { formatByteLimit } from "@/shared/lib/formatters";
import { MAX_AUDIO_CLIPS_PER_REQUEST, MAX_AUDIO_TOTAL_BYTES } from "@/shared/lib/inputLimits";

const START_BLANK_GUARD_TARGET = "__start_blank__";

export function CaptureScreen(): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const { customerId, id: quoteIdFromRoute } = useParams<{
    customerId?: string;
    id?: string;
  }>();
  const { setDraft } = useQuoteDraft();
  const isMountedRef = useRef(true);
  const extractionStageTimerRefs = useRef<number[]>([]);
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
  } = useVoiceCapture();

  const [notes, setNotes] = useState("");
  const [extractionStage, setExtractionStage] = useState<string | null>(null);
  const [pendingExitTarget, setPendingExitTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStartingBlank, setIsStartingBlank] = useState(false);
  const isExtracting = extractionStage !== null;
  const hasClips = clips.length > 0;
  const hasNotes = notes.trim().length > 0;
  const appendQuoteId = quoteIdFromRoute ?? null;
  const isAppendMode = appendQuoteId !== null;
  const extractionHelperCopy = isAppendMode
    ? getAppendHelperCopy(hasClips, hasNotes)
    : getExtractionHelperCopy(hasClips, hasNotes);
  const launchOrigin = isAppendMode
    ? (readCaptureLaunchOrigin(location.state) ??
      `/documents/${appendQuoteId}/edit`)
    : resolveCaptureLaunchOrigin({
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
  }

  function dismissActiveError(): void {
    if (error) {
      setError(null);
      return;
    }
    if (voiceError) {
      clearError();
    }
  }

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      extractionStageTimerRefs.current.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      extractionStageTimerRefs.current = [];
    };
  }, []);

  function applyDraft(
    sourceType: QuoteSourceType,
    extraction: ExtractionResult,
    quoteId: string,
  ): void {
    writeQuoteConfidenceNotes(quoteId, extraction.confidence_notes);
    setDraft({
      quoteId,
      customerId: customerId ?? "",
      launchOrigin,
      title: "",
      transcript: extraction.transcript,
      lineItems: extraction.line_items.map((lineItem) => ({
        description: lineItem.description,
        details: lineItem.details,
        price: lineItem.price,
        flagged: lineItem.flagged,
        flagReason: lineItem.flag_reason,
      })),
      total: extraction.total,
      taxRate: null,
      discountType: null,
      discountValue: null,
      depositAmount: null,
      confidenceNotes: extraction.confidence_notes,
      notes: "",
      sourceType,
    });
  }

  function applyAppendResult(
    quoteId: string,
    extraction: ExtractionResult,
  ): void {
    const existingNotes = readQuoteConfidenceNotes(quoteId);
    const nextNotes =
      extraction.confidence_notes.length > 0
        ? extraction.confidence_notes
        : existingNotes;
    writeQuoteConfidenceNotes(quoteId, nextNotes);
  }

  function navigateToReview(quoteId: string): void {
    if (isAppendMode) {
      navigate(`/documents/${quoteId}/edit`, {
        state: { reseedDraft: true },
      });
      return;
    }
    navigate(`/documents/${quoteId}/edit`);
  }

  async function onExtract(): Promise<void> {
    clearActionErrors();
    if (clips.length > MAX_AUDIO_CLIPS_PER_REQUEST) {
      setError(
        `You can upload up to ${MAX_AUDIO_CLIPS_PER_REQUEST} clips at a time.`,
      );
      return;
    }
    const totalClipBytes = clips.reduce(
      (runningTotal, clip) => runningTotal + clip.blob.size,
      0,
    );
    if (totalClipBytes > MAX_AUDIO_TOTAL_BYTES) {
      setError(
        `Total audio upload must be ${formatByteLimit(MAX_AUDIO_TOTAL_BYTES)} or smaller.`,
      );
      return;
    }
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
      const extraction =
        isAppendMode && appendQuoteId
          ? await quoteService.appendExtraction(appendQuoteId, {
              clips: clips.map((clip) => clip.blob),
              notes,
            })
          : await quoteService.extract({
              clips: clips.map((clip) => clip.blob),
              notes,
              customerId,
            });
      if (!isMountedRef.current) {
        return;
      }
      const sourceType: QuoteSourceType = clips.length > 0 ? "voice" : "text";
      if (extraction.type === "sync") {
        if (isAppendMode) {
          applyAppendResult(extraction.quoteId, extraction.result);
        } else {
          applyDraft(sourceType, extraction.result, extraction.quoteId);
        }
        navigateToReview(extraction.quoteId);
        return;
      }

      await pollExtractionJob(extraction.jobId, sourceType, isAppendMode);
    } catch (submitError) {
      if (!isMountedRef.current) {
        return;
      }
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Unable to extract line items";
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
      const manualDraft = await quoteService.createManualDraft({ customerId });
      if (!isMountedRef.current) {
        return;
      }
      navigate(`/documents/${manualDraft.id}/edit`);
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
  async function pollExtractionJob(
    jobId: string,
    sourceType: QuoteSourceType,
    appendMode: boolean,
  ): Promise<void> {
    for (let pollCount = 0; pollCount < EXTRACTION_MAX_POLLS; pollCount += 1) {
      const job = await jobService.getJobStatus(jobId);
      if (!isMountedRef.current) {
        return;
      }

      if (job.quote_id) {
        if (!job.extraction_result) {
          throw new Error(
            "Extraction completed without a result. Please try again.",
          );
        }
        if (appendMode) {
          applyAppendResult(job.quote_id, job.extraction_result);
        } else {
          applyDraft(sourceType, job.extraction_result, job.quote_id);
        }
        navigateToReview(job.quote_id);
        return;
      }

      if (job.status === "success") {
        throw new Error(
          appendMode
            ? "Append completed without a refreshed quote. Please try again."
            : "Extraction completed without a persisted draft. Please try again.",
        );
      }

      if (job.status === "terminal") {
        throw new Error("Extraction failed. Please try again.");
      }

      if (pollCount === EXTRACTION_MAX_POLLS - 1) {
        break;
      }
      await new Promise((resolve) => {
        window.setTimeout(resolve, EXTRACTION_POLL_INTERVAL_MS);
      });
      if (!isMountedRef.current) {
        return;
      }
    }

    throw new Error(
      "Extraction is taking longer than expected. Please try again.",
    );
  }

  function hasUnsavedWork(): boolean {
    return clips.length > 0 || notes.trim().length > 0;
  }
  function requestExit(target: string): void {
    if (hasUnsavedWork()) {
      setPendingExitTarget(target);
      return;
    }

    navigate(target, { replace: true });
  }

  function onBack(): void {
    requestExit(launchOrigin);
  }

  function onExitHome(): void {
    requestExit(HOME_ROUTE);
  }

  function onStartBlankClick(): void {
    if (hasUnsavedWork()) {
      setPendingExitTarget(START_BLANK_GUARD_TARGET);
      return;
    }
    void onStartBlank();
  }

  const displayedError = error ?? voiceError;
  const hasReachedClipLimit = clips.length >= MAX_AUDIO_CLIPS_PER_REQUEST;
  const canExtract = (hasClips || hasNotes) && !isExtracting && !isRecording;

  return (
    <main className="min-h-dvh bg-background">
      <WorkflowScreenHeader
        title={isAppendMode ? "Capture More Job Notes" : "Capture Job Notes"}
        subtitle={
          isAppendMode
            ? "Add clips or notes and we'll append line items to this quote"
            : "Describe the job and we'll extract the line items"
        }
        backLabel="Go back"
        onBack={onBack}
        onExitHome={onExitHome}
      />

      <section className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-36 pt-20">
        {!isSupported ? (
          <p className="mb-4 rounded-lg border border-warning-accent/40 bg-warning-container p-3 text-sm text-warning">
            Voice capture is not supported in this browser. You can still type
            notes and extract line items.
          </p>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col">
          <CaptureInputPanel
            clips={clips}
            isExtracting={isExtracting}
            removeClip={removeClip}
            notes={notes}
            onNotesChange={setNotes}
            isRecording={isRecording}
            elapsedSeconds={elapsedSeconds}
            hasReachedClipLimit={hasReachedClipLimit}
            isSupported={isSupported}
            onStartRecording={() => {
              void startRecording();
            }}
            onStopRecording={stopRecording}
            onStartBlank={isAppendMode ? undefined : onStartBlankClick}
            isStartBlankDisabled={isExtracting || isRecording || isStartingBlank}
          />
        </div>
      </section>

      <ScreenFooter>
        <div className="mx-auto w-full max-w-2xl">
          {extractionStage ? (
            <p className="mb-2 text-center text-sm text-on-surface-variant">
              {extractionStage}
            </p>
          ) : null}
          {extractionStage && extractionHelperCopy ? (
            <p className="mb-3 text-center text-xs text-on-surface-variant">
              {extractionHelperCopy}
            </p>
          ) : null}
          <Button
            variant="primary"
            className="w-full"
            disabled={!canExtract}
            isLoading={isExtracting}
            onClick={() => void onExtract()}
          >
            {isAppendMode ? "Extract More Line Items" : "Extract Line Items"}
          </Button>
        </div>
      </ScreenFooter>

      <Toast
        message={displayedError}
        variant="error"
        durationMs={null}
        onDismiss={dismissActiveError}
      />

      {pendingExitTarget ? (
        <ConfirmModal
          title="Leave this screen?"
          body="Your clips and notes will be lost."
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
