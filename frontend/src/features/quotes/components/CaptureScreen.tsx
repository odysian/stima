import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useQuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";
import { useVoiceCapture } from "@/features/quotes/hooks/useVoiceCapture";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteSourceType } from "@/features/quotes/types/quote.types";
import { Button } from "@/shared/components/Button";

const VOICE_LOADING_STAGES = [
  "Uploading clips...",
  "Transcribing audio...",
  "Extracting line items...",
] as const;

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

type CaptureMode = QuoteSourceType;

export function CaptureScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { customerId } = useParams<{ customerId: string }>();
  const { setDraft } = useQuoteDraft();
  const {
    clips,
    elapsedSeconds,
    error: voiceError,
    isRecording,
    isSupported,
    startRecording,
    stopRecording,
    removeClip,
    clearClips,
    clearError,
  } = useVoiceCapture();

  const [mode, setMode] = useState<CaptureMode>("voice");
  const [notes, setNotes] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceStageIndex, setVoiceStageIndex] = useState(0);

  const canSubmitText = notes.trim().length > 0 && !isExtracting;
  const canSubmitVoice = clips.length > 0 && !isExtracting && !isRecording;

  function handleModeChange(nextMode: CaptureMode): void {
    setMode(nextMode);
    setError(null);
    clearError();
  }

  function applyDraft(
    sourceType: QuoteSourceType,
    extraction: {
      transcript: string;
      line_items: Array<{ description: string; details: string | null; price: number | null }>;
      total: number | null;
      confidence_notes: string[];
    },
  ): void {
    if (!customerId) {
      throw new Error("Missing customer context. Please select a customer again.");
    }

    setDraft({
      customerId,
      transcript: extraction.transcript,
      lineItems: extraction.line_items,
      total: extraction.total,
      confidenceNotes: extraction.confidence_notes,
      notes: "",
      sourceType,
    });
  }

  async function onSubmitText(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!customerId) {
      setError("Missing customer context. Please select a customer again.");
      return;
    }

    setError(null);
    clearError();
    setIsExtracting(true);

    try {
      const extraction = await quoteService.convertNotes(notes.trim());
      applyDraft("text", extraction);
      navigate("/quotes/review");
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Unable to extract line items";
      setError(message);
    } finally {
      setIsExtracting(false);
    }
  }

  async function onSubmitVoice(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!customerId) {
      setError("Missing customer context. Please select a customer again.");
      return;
    }

    if (clips.length === 0) {
      setError("Record at least one clip before generating a draft.");
      return;
    }

    setError(null);
    clearError();
    setIsExtracting(true);
    setVoiceStageIndex(0);

    const stageInterval = window.setInterval(() => {
      setVoiceStageIndex((currentIndex) =>
        Math.min(currentIndex + 1, VOICE_LOADING_STAGES.length - 1),
      );
    }, 1200);

    try {
      const extraction = await quoteService.captureAudio(clips.map((clip) => clip.blob));
      applyDraft("voice", extraction);
      navigate("/quotes/review");
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Unable to process audio";
      setError(message);
    } finally {
      window.clearInterval(stageInterval);
      setIsExtracting(false);
      setVoiceStageIndex(0);
    }
  }

  const displayedError = error ?? voiceError;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <section className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-2xl font-semibold text-slate-900">Capture quote notes</h1>
        <p className="mb-6 text-sm text-slate-600">
          Voice capture is primary. You can still switch to typed notes when needed.
        </p>

        <div className="mb-6 inline-flex rounded-lg border border-slate-300 bg-slate-100 p-1">
          <button
            type="button"
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              mode === "voice"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
            onClick={() => handleModeChange("voice")}
          >
            Voice
          </button>
          <button
            type="button"
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              mode === "text"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
            onClick={() => handleModeChange("text")}
          >
            Text
          </button>
        </div>

        {displayedError ? (
          <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {displayedError}
          </p>
        ) : null}

        {mode === "voice" ? (
          <form className="flex flex-col gap-4" onSubmit={onSubmitVoice}>
            {!isSupported ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Voice capture is not supported in this browser. Switch to Text mode to continue.
              </p>
            ) : null}

            <section className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-800">Recorder</p>
              <p className="mt-1 text-xs text-slate-600">
                {isRecording ? `Recording... ${formatElapsed(elapsedSeconds)}` : "Not recording"}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {isRecording ? (
                  <Button type="button" onClick={stopRecording}>
                    Stop recording
                  </Button>
                ) : (
                  <Button type="button" onClick={() => void startRecording()} disabled={!isSupported}>
                    Record clip
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={() => {
                    clearClips();
                    clearError();
                  }}
                  disabled={clips.length === 0 || isRecording || isExtracting}
                >
                  Start over
                </Button>
              </div>
            </section>

            <section className="rounded-md border border-slate-200 p-4">
              <h2 className="text-sm font-semibold text-slate-800">Captured clips</h2>
              {clips.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">No clips yet. Record a clip to continue.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {clips.map((clip, index) => (
                    <li
                      key={clip.id}
                      className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
                    >
                      <p className="font-medium text-slate-900">
                        Clip {index + 1} ({clip.durationSeconds}s)
                      </p>
                      <audio controls src={clip.url} className="mt-2 w-full" />
                      <div className="mt-2">
                        <Button type="button" onClick={() => removeClip(clip.id)} disabled={isExtracting}>
                          Delete clip
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {isExtracting ? (
              <p role="status" className="text-sm text-slate-700">
                {VOICE_LOADING_STAGES[voiceStageIndex]}
              </p>
            ) : null}

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={!canSubmitVoice} isLoading={isExtracting}>
                Generate Draft
              </Button>
              <Button type="button" onClick={() => navigate("/quotes/new")}>Back</Button>
            </div>
          </form>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={onSubmitText}>
            <div className="flex flex-col gap-1">
              <label htmlFor="quote-notes" className="text-sm font-medium text-slate-700">
                Notes
              </label>
              <textarea
                id="quote-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="5 yards brown mulch, edge front beds..."
                rows={10}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </div>

            {isExtracting ? (
              <p role="status" className="text-sm text-slate-700">
                Extracting line items...
              </p>
            ) : null}

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={!canSubmitText} isLoading={isExtracting}>
                Generate Draft
              </Button>
              <Button type="button" onClick={() => navigate("/quotes/new")}>Back</Button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
