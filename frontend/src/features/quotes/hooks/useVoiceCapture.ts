import { useCallback, useEffect, useRef, useState } from "react";

const MIME_TYPE_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

export interface VoiceClip {
  id: string;
  blob: Blob;
  url: string;
  durationSeconds: number;
}

interface UseVoiceCaptureResult {
  clips: VoiceClip[];
  elapsedSeconds: number;
  error: string | null;
  isRecording: boolean;
  isSupported: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  removeClip: (clipId: string) => void;
  clearClips: () => void;
  clearError: () => void;
}

function canUseMediaRecorder(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

function resolvePreferredMimeType(): string | undefined {
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

function stopStream(stream: MediaStream | null): void {
  if (!stream) {
    return;
  }
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function revokeClipUrls(clips: VoiceClip[]): void {
  for (const clip of clips) {
    URL.revokeObjectURL(clip.url);
  }
}

export function useVoiceCapture(): UseVoiceCaptureResult {
  const [clips, setClips] = useState<VoiceClip[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported] = useState(canUseMediaRecorder);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const recordingStartRef = useRef<number | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const clipIdSequenceRef = useRef(0);
  const clipsRef = useRef<VoiceClip[]>([]);

  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const removeClip = useCallback((clipId: string) => {
    setClips((currentClips) => {
      const clipToRemove = currentClips.find((clip) => clip.id === clipId);
      if (clipToRemove) {
        URL.revokeObjectURL(clipToRemove.url);
      }
      return currentClips.filter((clip) => clip.id !== clipId);
    });
  }, []);

  const clearClips = useCallback(() => {
    setClips((currentClips) => {
      revokeClipUrls(currentClips);
      return [];
    });
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }
    recorder.stop();
  }, []);

  const startRecording = useCallback(async () => {
    if (!isSupported) {
      setError("Voice capture is not supported in this browser.");
      return;
    }

    if (isRecording) {
      return;
    }

    setError(null);
    setElapsedSeconds(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const preferredMimeType = resolvePreferredMimeType();
      const recorder = preferredMimeType
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recordingStartRef.current = Date.now();

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setError("Voice recording failed. Please try again.");
      };

      recorder.onstop = () => {
        stopTimer();
        const chunks = [...chunksRef.current];
        chunksRef.current = [];

        const recordingStart = recordingStartRef.current;
        const durationSeconds = recordingStart
          ? Math.max(1, Math.round((Date.now() - recordingStart) / 1000))
          : 1;

        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          if (blob.size > 0) {
            const nextClip: VoiceClip = {
              id: `clip-${clipIdSequenceRef.current}`,
              blob,
              url: URL.createObjectURL(blob),
              durationSeconds,
            };
            clipIdSequenceRef.current += 1;
            setClips((currentClips) => [...currentClips, nextClip]);
          } else {
            setError("Recorded clip was empty. Please try again.");
          }
        } else {
          setError("Recorded clip was empty. Please try again.");
        }

        stopStream(streamRef.current);
        streamRef.current = null;
        mediaRecorderRef.current = null;
        recordingStartRef.current = null;
        setElapsedSeconds(0);
        setIsRecording(false);
      };

      recorder.start();
      setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds((currentSeconds) => currentSeconds + 1);
      }, 1000);
    } catch {
      stopTimer();
      stopStream(streamRef.current);
      streamRef.current = null;
      mediaRecorderRef.current = null;
      setIsRecording(false);
      setError("Microphone access was denied or unavailable.");
    }
  }, [isRecording, isSupported, stopTimer]);

  useEffect(() => {
    return () => {
      stopTimer();
      stopStream(streamRef.current);
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      revokeClipUrls(clipsRef.current);
    };
  }, [stopTimer]);

  return {
    clips,
    elapsedSeconds,
    error,
    isRecording,
    isSupported,
    startRecording,
    stopRecording,
    removeClip,
    clearClips,
    clearError,
  };
}
