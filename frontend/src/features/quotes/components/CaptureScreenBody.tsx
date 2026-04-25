import { CaptureInputPanel } from "@/features/quotes/components/CaptureInputPanel";
import type { VoiceClip } from "@/features/quotes/hooks/useVoiceCapture";

interface CaptureScreenBodyProps {
  isSupported: boolean;
  isExtracting: boolean;
  clips: VoiceClip[];
  removeClip: (clipId: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  isRecording: boolean;
  elapsedSeconds: number;
  hasReachedClipLimit: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onStartBlank: () => void;
  isStartBlankDisabled: boolean;
}

export function CaptureScreenBody(props: CaptureScreenBodyProps): React.ReactElement {
  return (
    <section className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-36 pt-20">
      {!props.isSupported ? (
        <p className="ghost-shadow mb-4 rounded-[var(--radius-document)] border-l-4 border-warning-accent bg-warning-container p-4 text-sm text-warning">
          Voice capture is not supported in this browser. You can still type
          notes and extract line items.
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
        <CaptureInputPanel
          clips={props.clips}
          isExtracting={props.isExtracting}
          removeClip={props.removeClip}
          notes={props.notes}
          onNotesChange={props.onNotesChange}
          isRecording={props.isRecording}
          elapsedSeconds={props.elapsedSeconds}
          hasReachedClipLimit={props.hasReachedClipLimit}
          isSupported={props.isSupported}
          onStartRecording={props.onStartRecording}
          onStopRecording={props.onStopRecording}
          onStartBlank={props.onStartBlank}
          isStartBlankDisabled={props.isStartBlankDisabled}
        />
      </div>
    </section>
  );
}
