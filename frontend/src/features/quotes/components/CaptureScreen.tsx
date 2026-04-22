import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { useQuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";
import {
  EXTRACTION_MAX_POLLS,
  EXTRACTION_POLL_INTERVAL_MS,
  EXTRACTION_STAGE_DELAY_MS,
  getExtractionStages,
} from "@/features/quotes/components/captureScreenHelpers";
import { CaptureInputPanel } from "@/features/quotes/components/CaptureInputPanel";
import {
  resolveCaptureLaunchOrigin,
} from "@/features/quotes/utils/workflowNavigation";
import { useVoiceCapture } from "@/features/quotes/hooks/useVoiceCapture";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteDetail, QuoteSourceType } from "@/features/quotes/types/quote.types";
import { Button } from "@/shared/components/Button";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { ScreenFooter } from "@/shared/components/ScreenFooter";
import { WorkflowScreenHeader } from "@/shared/components/WorkflowScreenHeader";
import { jobService } from "@/shared/lib/jobService";
import { formatByteLimit } from "@/shared/lib/formatters";
import { MAX_AUDIO_CLIPS_PER_REQUEST, MAX_AUDIO_TOTAL_BYTES } from "@/shared/lib/inputLimits";
import { useToast } from "@/ui/Toast";

const START_BLANK_GUARD_TARGET = "__start_blank__";

export function CaptureScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { show } = useToast();
  const location = useLocation();
  const { customerId } = useParams<{ customerId?: string }>();
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
  }

  const dismissActiveErrorRef = useRef<() => void>(() => {});

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

  const displayedError = error ?? voiceError;

  useEffect(() => {
    dismissActiveErrorRef.current = () => {
      if (error) {
        setError(null);
        return;
      }
      if (voiceError) {
        clearError();
      }
    };
  }, [clearError, error, voiceError]);

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

  function applyDraftFromQuoteDetail(
    sourceType: QuoteSourceType,
    quoteDetail: QuoteDetail,
    quoteId: string,
  ): void {
    setDraft({
      quoteId,
      customerId: quoteDetail.customer_id ?? customerId ?? "",
      launchOrigin,
      title: "",
      transcript: quoteDetail.transcript,
      lineItems: quoteDetail.line_items.map((lineItem) => ({
        description: lineItem.description,
        details: lineItem.details,
        price: lineItem.price,
        flagged: lineItem.flagged,
        flagReason: lineItem.flag_reason,
      })),
      total: quoteDetail.total_amount,
      taxRate: quoteDetail.tax_rate,
      discountType: quoteDetail.discount_type,
      discountValue: quoteDetail.discount_value,
      depositAmount: quoteDetail.deposit_amount,
      notes: quoteDetail.notes ?? "",
      sourceType,
    });
  }

  async function hydrateFromPersistedQuote(
    quoteId: string,
    sourceType: QuoteSourceType,
  ): Promise<void> {
    const persistedQuote = await quoteService.getQuote(quoteId);
    applyDraftFromQuoteDetail(sourceType, persistedQuote, quoteId);
  }

  function navigateToReview(quoteId: string): void {
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
      const extraction = await quoteService.extract({
        clips: clips.map((clip) => clip.blob),
        notes,
        customerId,
      });
      if (!isMountedRef.current) {
        return;
      }
      const sourceType: QuoteSourceType = clips.length > 0 ? "voice" : "text";
      if (extraction.type === "sync") {
        await hydrateFromPersistedQuote(extraction.quoteId, sourceType);
        navigateToReview(extraction.quoteId);
        return;
      }

      await pollExtractionJob(extraction.jobId, sourceType);
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
        await hydrateFromPersistedQuote(job.quote_id, sourceType);
        navigateToReview(job.quote_id);
        return;
      }

      if (job.status === "success") {
        throw new Error("Extraction completed without a persisted draft. Please try again.");
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

  function onStartBlankClick(): void {
    if (hasUnsavedWork()) {
      setPendingExitTarget(START_BLANK_GUARD_TARGET);
      return;
    }
    void onStartBlank();
  }

  const hasReachedClipLimit = clips.length >= MAX_AUDIO_CLIPS_PER_REQUEST;
  const canExtract = (hasClips || hasNotes) && !isExtracting && !isRecording;

  return (
    <main className="min-h-dvh bg-background">
      <WorkflowScreenHeader
        title="Capture Job Notes"
        subtitle="Describe the job and we'll extract the line items"
        backLabel="Go back"
        onBack={onBack}
      />

      <section className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-36 pt-20">
        {!isSupported ? (
          <p className="ghost-shadow mb-4 rounded-[var(--radius-document)] border-l-4 border-warning-accent bg-warning-container p-4 text-sm text-warning">
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
            onStartBlank={onStartBlankClick}
            isStartBlankDisabled={isExtracting || isRecording || isStartingBlank}
          />
        </div>
      </section>

      <ScreenFooter>
        <div className="mx-auto w-full max-w-2xl">
          {extractionStage ? (
            <p className="mb-2 text-center text-sm font-medium text-on-surface-variant">
              {extractionStage}
            </p>
          ) : null}
          <Button
            variant="primary"
            className="w-full"
            disabled={!canExtract}
            isLoading={isExtracting}
            onClick={() => void onExtract()}
          >
            Extract Line Items
          </Button>
        </div>
      </ScreenFooter>

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
