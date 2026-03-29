import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useQuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";
import { useVoiceCapture } from "@/features/quotes/hooks/useVoiceCapture";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { ExtractionResult, QuoteSourceType } from "@/features/quotes/types/quote.types";
import { Button } from "@/shared/components/Button";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { ScreenFooter } from "@/shared/components/ScreenFooter";
import { ScreenHeader } from "@/shared/components/ScreenHeader";

const EXTRACTION_STAGE_DELAY_MS = 2500;

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
  const { customerId } = useParams<{ customerId: string }>();
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
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isExtracting = extractionStage !== null;
  const hasClips = clips.length > 0;
  const hasNotes = notes.trim().length > 0;
  const extractionHelperCopy = getExtractionHelperCopy(hasClips, hasNotes);

  function clearExtractionStageTimers(): void {
    extractionStageTimerRefs.current.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    extractionStageTimerRefs.current = [];
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

  function applyDraft(sourceType: QuoteSourceType, extraction: ExtractionResult): void {
    if (!customerId) {
      throw new Error("Missing customer context. Please select a customer again.");
    }

    setDraft({
      customerId,
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

    setError(null);
    clearError();
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
      });
      if (!isMountedRef.current) {
        return;
      }
      applyDraft(clips.length > 0 ? "voice" : "text", extraction);
      navigate("/quotes/review");
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

  function hasUnsavedWork(): boolean {
    return clips.length > 0 || notes.trim().length > 0;
  }

  function onBack(): void {
    if (hasUnsavedWork()) {
      setShowLeaveConfirm(true);
      return;
    }

    navigate(-1);
  }

  const displayedError = error ?? voiceError;
  const canExtract = (hasClips || hasNotes) && !isExtracting && !isRecording;

  return (
    <main className="min-h-screen bg-background pb-36">
      <ScreenHeader
        title="Capture Job Notes"
        subtitle="Describe the job and we'll extract the line items"
        backLabel="Go back"
        onBack={onBack}
      />

      <section className="mx-auto w-full max-w-2xl px-4 pb-24 pt-20">
        {displayedError ? (
          <div className="mb-4">
            <FeedbackMessage variant="error">{displayedError}</FeedbackMessage>
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
                    className="rounded-full p-1 text-outline transition-colors hover:bg-surface-container-low active:scale-95"
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
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Add any typed details here..."
            className="w-full rounded-lg bg-surface-container-high px-4 py-3 font-body text-sm text-on-surface placeholder:text-outline transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/30 focus:outline-none"
          />
        </section>

        {isRecording ? (
          <div className="my-6 flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-secondary" />
              <p className="text-sm font-medium text-secondary">Recording... {formatElapsed(elapsedSeconds)}</p>
            </div>
            <button
              type="button"
              className="flex h-20 w-20 items-center justify-center rounded-full bg-secondary shadow-[0_0_24px_rgba(0,0,0,0.12)] transition-all active:scale-95"
              onClick={stopRecording}
            >
              <span className="material-symbols-outlined text-4xl text-white">stop</span>
            </button>
          </div>
        ) : (
          <div className="my-6 flex flex-col items-center gap-3">
            <p className="text-xs uppercase tracking-widest text-outline">TAP TO START</p>
            <button
              type="button"
              className="forest-gradient flex h-20 w-20 items-center justify-center rounded-full shadow-[0_0_24px_rgba(0,0,0,0.12)] transition-all active:scale-95"
              onClick={() => void startRecording()}
              disabled={!isSupported}
            >
              <span className="material-symbols-outlined text-4xl text-white">mic</span>
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

      {showLeaveConfirm ? (
        <ConfirmModal
          title="Leave this screen?"
          body="Your clips and notes will be lost."
          confirmLabel="Leave"
          cancelLabel="Stay"
          onConfirm={() => navigate(-1)}
          onCancel={() => setShowLeaveConfirm(false)}
        />
      ) : null}
    </main>
  );
}
