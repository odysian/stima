import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { useQuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";
import { HOME_ROUTE, resolveCaptureLaunchOrigin } from "@/features/quotes/utils/workflowNavigation";
import { useVoiceCapture } from "@/features/quotes/hooks/useVoiceCapture";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { ExtractionResult, QuoteSourceType } from "@/features/quotes/types/quote.types";
import { Button } from "@/shared/components/Button";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { ScreenFooter } from "@/shared/components/ScreenFooter";
import { WorkflowScreenHeader } from "@/shared/components/WorkflowScreenHeader";
import { jobService } from "@/shared/lib/jobService";
import { formatByteLimit } from "@/shared/lib/formatters";
import {
  MAX_AUDIO_CLIPS_PER_REQUEST,
  MAX_AUDIO_TOTAL_BYTES,
  NOTE_INPUT_MAX_CHARS,
} from "@/shared/lib/inputLimits";

const EXTRACTION_STAGE_DELAY_MS = 2500;
const EXTRACTION_POLL_INTERVAL_MS = 2000;
const EXTRACTION_MAX_POLLS = 60;

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function getExtractionStages(hasClips: boolean, hasNotes: boolean): string[] {
  if (hasClips && hasNotes) {
    return ["Uploading audio...", "Transcribing audio...", "Extracting line items from audio and notes..."];
  }
  if (hasClips) {
    return ["Uploading audio...", "Transcribing audio...", "Extracting line items..."];
  }
  return ["Analyzing notes...", "Extracting line items..."];
}

function getExtractionHelperCopy(hasClips: boolean, hasNotes: boolean): string | null {
  if (hasClips && hasNotes) {
    return "We will combine your recording and notes into one draft. If extraction fails, both stay here.";
  }
  if (hasClips) {
    return "Audio uploads and transcription can take a few moments. If extraction fails, your clips stay here.";
  }
  if (hasNotes) {
    return "We will turn your notes into draft line items. If extraction fails, your notes stay here.";
  }
  return null;
}

export function CaptureScreen(): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const { customerId } = useParams<{ customerId: string }>();
  const { draft, setDraft } = useQuoteDraft();
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
  const isExtracting = extractionStage !== null;
  const hasClips = clips.length > 0;
  const hasNotes = notes.trim().length > 0;
  const extractionHelperCopy = getExtractionHelperCopy(hasClips, hasNotes);
  const launchOrigin = resolveCaptureLaunchOrigin({
    customerId,
    draftCustomerId: draft?.customerId,
    draftLaunchOrigin: draft?.launchOrigin,
    locationState: location.state,
  });

  function clearExtractionStageTimers(): void {
    extractionStageTimerRefs.current.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    extractionStageTimerRefs.current = [];
  }

  function clearSubmissionErrors(): void {
    setError(null);
    clearError();
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

  function applyDraft(sourceType: QuoteSourceType, extraction: ExtractionResult, quoteId: string): void {
    if (!customerId) {
      throw new Error("Missing customer context. Please select a customer again.");
    }

    setDraft({
      quoteId,
      customerId,
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

  async function onExtract(): Promise<void> {
    if (!customerId) {
      setError("Missing customer context. Please select a customer again.");
      return;
    }

    clearSubmissionErrors();
    if (clips.length > MAX_AUDIO_CLIPS_PER_REQUEST) {
      setError(`You can upload up to ${MAX_AUDIO_CLIPS_PER_REQUEST} clips at a time.`);
      return;
    }
    const totalClipBytes = clips.reduce((runningTotal, clip) => runningTotal + clip.blob.size, 0);
    if (totalClipBytes > MAX_AUDIO_TOTAL_BYTES) {
      setError(`Total audio upload must be ${formatByteLimit(MAX_AUDIO_TOTAL_BYTES)} or smaller.`);
      return;
    }
    clearExtractionStageTimers();
    const stages = getExtractionStages(hasClips, hasNotes);
    setExtractionStage(stages[0]);
    stages.slice(1).forEach((stage, index) => {
      const timerId = window.setTimeout(() => {
        if (!isMountedRef.current) {
          return;
        }
        setExtractionStage(stage);
      }, EXTRACTION_STAGE_DELAY_MS * (index + 1));
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
        applyDraft(sourceType, extraction.result, extraction.quoteId);
        navigate("/quotes/review");
        return;
      }

      await pollExtractionJob(extraction.jobId, sourceType);
    } catch (submitError) {
      if (!isMountedRef.current) {
        return;
      }
      const message = submitError instanceof Error ? submitError.message : "Unable to extract line items";
      setError(message);
    } finally {
      const shouldResetExtractionStage = isMountedRef.current;
      clearExtractionStageTimers();
      if (shouldResetExtractionStage) {
        setExtractionStage(null);
      }
    }
  }

  async function pollExtractionJob(jobId: string, sourceType: QuoteSourceType): Promise<void> {
    for (let pollCount = 0; pollCount < EXTRACTION_MAX_POLLS; pollCount += 1) {
      const job = await jobService.getJobStatus(jobId);
      if (!isMountedRef.current) {
        return;
      }

      if (job.status === "success") {
        if (!job.extraction_result) {
          throw new Error("Extraction completed without a result. Please try again.");
        }
        if (!job.quote_id) {
          throw new Error("Extraction completed without a persisted draft. Please try again.");
        }
        applyDraft(sourceType, job.extraction_result, job.quote_id);
        navigate("/quotes/review");
        return;
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

    throw new Error("Extraction is taking longer than expected. Please try again.");
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

  const displayedError = error ?? voiceError;
  const hasReachedClipLimit = clips.length >= MAX_AUDIO_CLIPS_PER_REQUEST;
  const canExtract = (hasClips || hasNotes) && !isExtracting && !isRecording;

  return (
    <main className="min-h-screen bg-background pb-36">
      <WorkflowScreenHeader
        title="Capture Job Notes"
        subtitle="Describe the job and we'll extract the line items"
        backLabel="Go back"
        onBack={onBack}
        onExitHome={onExitHome}
      />

      <section className="mx-auto w-full max-w-2xl px-4 pb-24 pt-20">
        {displayedError ? (
          <div className="mb-4 space-y-3">
            <FeedbackMessage variant="error">{displayedError}</FeedbackMessage>
            {error ? (
              <Button type="button" onClick={clearSubmissionErrors}>
                Try again
              </Button>
            ) : null}
          </div>
        ) : null}

        {!isSupported ? (
          <p className="mb-4 rounded-lg border border-warning-accent/40 bg-warning-container p-3 text-sm text-warning">
            Voice capture is not supported in this browser. You can still type notes and extract line items.
          </p>
        ) : null}

        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-headline text-sm font-semibold uppercase tracking-wide text-on-surface">
              RECORDED CLIPS
            </h2>
            <span className="rounded-sm bg-surface-container-low px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
              {clips.length} CLIPS
            </span>
          </div>

          {clips.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-outline-variant/30 bg-surface-container-lowest p-10">
              <span className="material-symbols-outlined text-4xl text-outline">mic_off</span>
              <p className="text-sm text-outline">No clips recorded yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {clips.map((clip, index) => (
                <div
                  key={clip.id}
                  className="flex items-center justify-between rounded-lg bg-surface-container-lowest p-3 ghost-shadow"
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-outline">play_arrow</span>
                    <p className="text-sm text-on-surface">
                      Clip {index + 1} · {clip.durationSeconds}s
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Delete clip ${index + 1}`}
                    className="cursor-pointer rounded-full p-1 text-outline transition-colors hover:bg-surface-container-low active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => removeClip(clip.id)}
                    disabled={isExtracting}
                  >
                    <span className="material-symbols-outlined text-base">close</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mb-4">
          <label
            htmlFor="capture-written-description"
            className="mb-3 block font-headline text-sm font-semibold uppercase tracking-wide text-on-surface"
          >
            WRITTEN DESCRIPTION
          </label>
          <textarea
            id="capture-written-description"
            rows={4}
            maxLength={NOTE_INPUT_MAX_CHARS}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Add any typed details here..."
            className="w-full rounded-lg bg-surface-container-high px-4 py-3 font-body text-sm text-on-surface placeholder:text-outline transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/30 focus:outline-none"
          />
          <p className="mt-2 text-xs text-outline">
            {notes.length}/{NOTE_INPUT_MAX_CHARS}
          </p>
        </section>

        {isRecording ? (
          <div className="my-6 flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-secondary" />
              <p className="text-sm font-medium text-secondary">Recording... {formatElapsed(elapsedSeconds)}</p>
            </div>
            <button
              type="button"
              className="ghost-shadow flex h-20 w-20 cursor-pointer items-center justify-center rounded-full bg-secondary text-on-secondary transition-all active:scale-95"
              onClick={stopRecording}
            >
              <span className="material-symbols-outlined text-4xl">stop</span>
            </button>
          </div>
        ) : (
          <div className="my-6 flex flex-col items-center gap-3">
            <p className="text-xs uppercase tracking-widest text-outline">TAP TO START</p>
            {hasReachedClipLimit ? (
              <p className="text-center text-xs text-outline">
                Maximum of {MAX_AUDIO_CLIPS_PER_REQUEST} clips per request reached.
              </p>
            ) : null}
            <button
              type="button"
              className="forest-gradient ghost-shadow flex h-20 w-20 cursor-pointer items-center justify-center rounded-full text-on-primary transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void startRecording()}
              disabled={!isSupported || hasReachedClipLimit}
            >
              <span className="material-symbols-outlined text-4xl">mic</span>
            </button>
          </div>
        )}
      </section>

      <ScreenFooter>
        <div className="mx-auto w-full max-w-2xl">
          {extractionStage ? (
            <p className="mb-2 text-center text-sm text-on-surface-variant">{extractionStage}</p>
          ) : null}
          {extractionStage && extractionHelperCopy ? (
            <p className="mb-3 text-center text-xs text-on-surface-variant">{extractionHelperCopy}</p>
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
            navigate(nextTarget, { replace: true });
          }}
          onCancel={() => setPendingExitTarget(null)}
        />
      ) : null}
    </main>
  );
}
