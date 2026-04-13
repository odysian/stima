import { formatElapsed } from "@/features/quotes/components/captureScreenHelpers";
import type { VoiceClip } from "@/features/quotes/hooks/useVoiceCapture";
import {
  MAX_AUDIO_CLIPS_PER_REQUEST,
  NOTE_INPUT_MAX_CHARS,
} from "@/shared/lib/inputLimits";

interface CaptureInputPanelProps {
  clips: VoiceClip[];
  isExtracting: boolean;
  removeClip: (clipId: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  isRecording: boolean;
  elapsedSeconds: number;
  hasReachedClipLimit: boolean;
  isSupported: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onStartBlank?: () => void;
  isStartBlankDisabled?: boolean;
}

export function CaptureInputPanel({
  clips,
  isExtracting,
  removeClip,
  notes,
  onNotesChange,
  isRecording,
  elapsedSeconds,
  hasReachedClipLimit,
  isSupported,
  onStartRecording,
  onStopRecording,
  onStartBlank,
  isStartBlankDisabled = false,
}: CaptureInputPanelProps): React.ReactElement {
  return (
    <>
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
          <div className="flex h-28 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-outline-variant/30 bg-surface-container-lowest p-4">
            <span className="material-symbols-outlined text-4xl text-outline">
              mic_off
            </span>
            <p className="text-sm text-outline">No clips recorded yet</p>
          </div>
        ) : (
          <div
            data-testid="recorded-clips-scroll-region"
            className="h-[clamp(8rem,20dvh,13rem)] space-y-2 overflow-y-auto pr-1"
          >
            {clips.map((clip, index) => {
              const clipNumber = clip.sequenceNumber ?? index + 1;
              return (
                <div
                  key={clip.id}
                  className="flex items-center justify-between rounded-lg bg-surface-container-lowest p-3 ghost-shadow"
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-outline">
                      play_arrow
                    </span>
                    <p className="text-sm text-on-surface">
                      Clip {clipNumber} · {clip.durationSeconds}s
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Delete clip ${clipNumber}`}
                    className="cursor-pointer rounded-full p-1 text-outline transition-colors hover:bg-surface-container-low active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => removeClip(clip.id)}
                    disabled={isExtracting}
                  >
                    <span className="material-symbols-outlined text-base">
                      close
                    </span>
                  </button>
                </div>
              );
            })}
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
          rows={2}
          maxLength={NOTE_INPUT_MAX_CHARS}
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="Add any typed details here..."
          className="w-full resize-none rounded-lg bg-surface-container-high px-4 py-3 font-body text-sm text-on-surface placeholder:text-outline transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/30 focus:outline-none"
        />
        {onStartBlank ? (
          <button
            type="button"
            className="mt-3 cursor-pointer text-sm text-primary underline decoration-primary/60 underline-offset-4 transition-colors hover:text-primary/80 disabled:cursor-not-allowed disabled:text-outline"
            onClick={onStartBlank}
            disabled={isStartBlankDisabled}
          >
            Or start with a blank document
          </button>
        ) : null}
      </section>

      {isRecording ? (
        <div className="mt-auto flex flex-col items-center gap-3 pt-4 sm:pt-6">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-secondary" />
            <p className="text-sm font-medium text-secondary">
              Recording... {formatElapsed(elapsedSeconds)}
            </p>
          </div>
          <button
            type="button"
            className="ghost-shadow flex h-20 w-20 cursor-pointer items-center justify-center rounded-full bg-secondary text-on-secondary transition-all active:scale-95"
            onClick={onStopRecording}
          >
            <span className="material-symbols-outlined text-4xl">stop</span>
          </button>
        </div>
      ) : (
        <div className="mt-auto flex flex-col items-center gap-3 pt-4 sm:pt-6">
          <p className="text-xs uppercase tracking-widest text-outline">
            TAP TO START
          </p>
          {hasReachedClipLimit ? (
            <p className="text-center text-xs text-outline">
              Maximum of {MAX_AUDIO_CLIPS_PER_REQUEST} clips per request reached.
            </p>
          ) : null}
          <button
            type="button"
            className="forest-gradient ghost-shadow flex h-20 w-20 cursor-pointer items-center justify-center rounded-full text-on-primary transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onStartRecording}
            disabled={!isSupported || hasReachedClipLimit}
          >
            <span className="material-symbols-outlined text-4xl">mic</span>
          </button>
        </div>
      )}
    </>
  );
}
