import { listClipsForSession } from "@/features/quotes/offline/audioRepository";
import { getTotalAudioBytes, saveAudioClip } from "@/features/quotes/offline/audioRepository";
import { MAX_AUDIO_TOTAL_BYTES } from "@/shared/lib/inputLimits";

const MIME_TYPE_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

export const CLIP_SAVE_FAILURE_MESSAGE =
  "Stima could not save this clip. Free up device storage or remove an existing clip, then try again.";
export const EMPTY_CLIP_MESSAGE = "Recorded clip was empty. Please try again.";
export const CLIP_LIMIT_REACHED_MESSAGE = "Maximum clips reached.";
export const CLIP_LENGTH_LIMIT_REACHED_MESSAGE = "Clip length limit reached.";
export const STORAGE_SOFT_CAP_MESSAGE =
  "Local audio storage is above 100 MB. Remove old clips if recordings stop saving.";

export const MAX_VOICE_CLIPS_PER_CAPTURE = 5;
export const MAX_VOICE_CLIP_DURATION_SECONDS = 120;

export interface VoiceClip {
  id: string;
  url?: string | null;
  durationSeconds: number;
  sequenceNumber?: number;
  sizeBytes: number;
  mimeType: string;
}

export function canUseMediaRecorder(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

export function resolvePreferredMimeType(): string | undefined {
  if (!canUseMediaRecorder()) {
    return undefined;
  }

  for (const candidate of MIME_TYPE_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

export function stopStream(stream: MediaStream | null): void {
  if (!stream) {
    return;
  }
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export function revokeClipUrl(url: string | undefined | null): void {
  if (!url) {
    return;
  }
  URL.revokeObjectURL(url);
}

export async function loadPersistedVoiceClips(
  sessionId: string,
): Promise<{ clips: VoiceClip[]; maxSequence: number }> {
  const persistedClips = await listClipsForSession(sessionId);
  const clips = persistedClips.map((clip) => ({
    id: clip.clipId,
    durationSeconds: clip.durationSeconds ?? 0,
    sequenceNumber: clip.sequenceNumber,
    sizeBytes: clip.sizeBytes,
    mimeType: clip.mimeType,
  }));
  const maxSequence = clips.reduce(
    (currentMax, clip) => Math.max(currentMax, clip.sequenceNumber ?? 0),
    0,
  );
  return { clips, maxSequence };
}

export async function persistRecordedClip(params: {
  clipIdSequence: number;
  sessionId: string;
  userId: string;
  blob: Blob;
  recorderMimeType: string;
  durationSeconds: number;
}): Promise<{ clip: VoiceClip; nextSequenceNumber: number; exceededSoftCap: boolean }> {
  const nextSequenceNumber = params.clipIdSequence + 1;
  const clipId = `clip-${params.clipIdSequence}`;
  const mimeType = params.blob.type || params.recorderMimeType || "audio/webm";

  await saveAudioClip({
    clipId,
    sessionId: params.sessionId,
    userId: params.userId,
    blob: params.blob,
    mimeType,
    sizeBytes: params.blob.size,
    durationSeconds: params.durationSeconds,
    sequenceNumber: nextSequenceNumber,
  });

  const totalAudioBytes = await getTotalAudioBytes(params.userId);
  return {
    clip: {
      id: clipId,
      durationSeconds: params.durationSeconds,
      sequenceNumber: nextSequenceNumber,
      sizeBytes: params.blob.size,
      mimeType,
    },
    nextSequenceNumber,
    exceededSoftCap: totalAudioBytes > MAX_AUDIO_TOTAL_BYTES,
  };
}
