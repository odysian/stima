import { formatElapsed } from "@/features/quotes/components/captureScreenHelpers";
import type { VoiceClip } from "@/features/quotes/hooks/useVoiceCapture";
import {
  MAX_AUDIO_CLIPS_PER_REQUEST,
  NOTE_INPUT_MAX_CHARS,
} from "@/shared/lib/inputLimits";
import { Button } from "@/shared/components/Button";
import { Eyebrow } from "@/ui/Eyebrow";

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
      <section className="mb-4 rounded-[var(--radius-document)] border border-outline-variant/20 bg-surface-container-low p-4">
        <div className="mb-3 flex items-center justify-between">
          <Eyebrow className="text-on-surface">RECORDED CLIPS</Eyebrow>
          <Eyebrow as="span" className="rounded-full bg-surface-container-lowest px-2.5 py-1 tracking-widest">
            {clips.length} CLIPS
          </Eyebrow>
        </div>

        {clips.length === 0 ? (
          <div className="ghost-shadow flex h-28 flex-col items-center justify-center gap-2 rounded-[var(--radius-document)] border-2 border-dashed border-outline-variant/30 bg-surface-container-lowest p-4">
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
                  className="ghost-shadow flex items-center justify-between rounded-[var(--radius-document)] border border-outline-variant/20 bg-surface-container-lowest p-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-outline">
                      play_arrow
                    </span>
                    <p className="text-sm text-on-surface">
                      Clip {clipNumber} · {clip.durationSeconds}s
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="iconButton"
                    size="xs"
                    aria-label={`Delete clip ${clipNumber}`}
                    className="text-outline hover:bg-surface-container-low"
                    onClick={() => removeClip(clip.id)}
                    disabled={isExtracting}
                  >
                    <span className="material-symbols-outlined text-base">
                      close
                    </span>
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mb-4 rounded-[var(--radius-document)] border border-outline-variant/20 bg-surface-container-low p-4">
        <label
          htmlFor="capture-written-description"
          className="mb-3 block"
        >
          <Eyebrow className="text-on-surface">WRITTEN DESCRIPTION</Eyebrow>
        </label>
        <textarea
          id="capture-written-description"
          rows={2}
          maxLength={NOTE_INPUT_MAX_CHARS}
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="Add any typed details here..."
          className="w-full resize-none rounded-[var(--radius-document)] border border-outline-variant/25 bg-surface-container-high px-4 py-3 font-body text-sm text-on-surface placeholder:text-outline transition-all focus:border-primary/40 focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/30 focus:outline-none"
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
        <div className="mt-auto mb-2 flex flex-col items-center gap-3 pt-4 sm:pt-6">
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
        <div className="mt-auto mb-2 flex flex-col items-center gap-3 pt-4 sm:pt-6">
          <Eyebrow as="span" className="text-xs tracking-widest">TAP TO START</Eyebrow>
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
