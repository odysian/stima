import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteAllClipsForSession,
  deleteAudioClip,
} from "@/features/quotes/offline/audioRepository";
import {
  canUseMediaRecorder,
  CLIP_LENGTH_LIMIT_REACHED_MESSAGE,
  CLIP_LIMIT_REACHED_MESSAGE,
  CLIP_SAVE_FAILURE_MESSAGE,
  EMPTY_CLIP_MESSAGE,
  loadPersistedVoiceClips,
  MAX_VOICE_CLIP_DURATION_SECONDS,
  MAX_VOICE_CLIPS_PER_CAPTURE,
  persistRecordedClip,
  resolvePreferredMimeType,
  revokeClipUrl,
  STORAGE_SOFT_CAP_MESSAGE,
  stopStream,
} from "@/features/quotes/hooks/useVoiceCapture.helpers";
import type { VoiceClip } from "@/features/quotes/hooks/useVoiceCapture.helpers";
import { perfMark, perfMeasure } from "@/shared/perf";
export {
  MAX_VOICE_CLIP_DURATION_SECONDS,
  MAX_VOICE_CLIPS_PER_CAPTURE,
} from "@/features/quotes/hooks/useVoiceCapture.helpers";
export type { VoiceClip } from "@/features/quotes/hooks/useVoiceCapture.helpers";
interface UseVoiceCaptureResult {
  clips: VoiceClip[];
  elapsedSeconds: number;
  error: string | null;
  isRecording: boolean;
  isSupported: boolean;
  startRecording: (sessionIdOverride?: string | null) => Promise<void>;
  stopRecording: () => void;
  removeClip: (clipId: string) => void;
  clearClips: () => void;
  clearError: () => void;
}
export function useVoiceCapture(
  sessionId: string | null,
  userId: string | undefined,
): UseVoiceCaptureResult {
  const [clips, setClips] = useState<VoiceClip[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported] = useState(canUseMediaRecorder);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const durationLimitRef = useRef<number | null>(null);
  const recordingStartRef = useRef<number | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const clipIdSequenceRef = useRef(0);
  const clipsRef = useRef<VoiceClip[]>([]);
  const clipUrlByIdRef = useRef<Map<string, string>>(new Map());
  const sessionIdRef = useRef<string | null>(sessionId);
  const userIdRef = useRef<string | undefined>(userId);
  const recordingSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);
  useEffect(() => {
    let isActive = true;
    if (!sessionId) {
      setClips([]);
      clipIdSequenceRef.current = 0;
      return () => {
        isActive = false;
      };
    }
    void (async () => {
      try {
        const { clips: persistedClips, maxSequence } = await loadPersistedVoiceClips(sessionId);
        if (!isActive) {
          return;
        }
        setClips(persistedClips);
        clipIdSequenceRef.current = maxSequence;
      } catch {
        if (isActive) {
          setError("Unable to load saved clips on this device.");
        }
      }
    })();
    return () => {
      isActive = false;
    };
  }, [sessionId]);
  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  const clearDurationLimitTimer = useCallback(() => {
    if (durationLimitRef.current !== null) {
      window.clearTimeout(durationLimitRef.current);
      durationLimitRef.current = null;
    }
  }, []);
  const clearError = useCallback(() => {
    setError(null);
  }, []);
  const removeClip = useCallback((clipId: string) => {
    const trackedUrl = clipUrlByIdRef.current.get(clipId);
    revokeClipUrl(trackedUrl);
    clipUrlByIdRef.current.delete(clipId);
    setClips((currentClips) => currentClips.filter((clip) => clip.id !== clipId));
    if (!sessionIdRef.current) {
      return;
    }
    void deleteAudioClip(clipId).catch(() => {
      setError("Could not remove this clip from local storage.");
    });
  }, []);
  const clearClips = useCallback(() => {
    clipUrlByIdRef.current.forEach((objectUrl) => {
      revokeClipUrl(objectUrl);
    });
    clipUrlByIdRef.current.clear();
    setClips([]);
    const activeSessionId = sessionIdRef.current;
    if (!activeSessionId) {
      return;
    }
    void deleteAllClipsForSession(activeSessionId).catch(() => {
      setError("Could not clear local clips.");
    });
  }, []);
  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }
    recorder.stop();
  }, []);
  const startRecording = useCallback(async (sessionIdOverride?: string | null) => {
    if (!isSupported) {
      setError("Voice capture is not supported in this browser.");
      return;
    }
    if (isRecording) {
      return;
    }
    if (clipsRef.current.length >= MAX_VOICE_CLIPS_PER_CAPTURE) {
      setError(CLIP_LIMIT_REACHED_MESSAGE);
      return;
    }
    const activeSessionId = sessionIdOverride ?? sessionIdRef.current;
    const activeUserId = userIdRef.current;
    if (!activeSessionId || !activeUserId) {
      setError(CLIP_SAVE_FAILURE_MESSAGE);
      return;
    }
    perfMark("capture:record:tap");
    setError(null);
    setElapsedSeconds(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      perfMark("capture:record:stream_ready");
      const preferredMimeType = resolvePreferredMimeType();
      const recorder = preferredMimeType
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recordingStartRef.current = Date.now();
      recordingSessionIdRef.current = activeSessionId;
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        setError("Voice recording failed. Please try again.");
      };
      recorder.onstop = () => {
        void (async () => {
          stopTimer();
          clearDurationLimitTimer();
          const chunks = [...chunksRef.current];
          chunksRef.current = [];
          const recordingStart = recordingStartRef.current;
          const durationSeconds = recordingStart
            ? Math.max(1, Math.round((Date.now() - recordingStart) / 1000))
            : 1;
          try {
            if (chunks.length === 0) {
              setError(EMPTY_CLIP_MESSAGE);
              return;
            }
            const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
            if (blob.size === 0) {
              setError(EMPTY_CLIP_MESSAGE);
              return;
            }
            const targetSessionId = recordingSessionIdRef.current;
            const targetUserId = userIdRef.current;
            if (!targetSessionId || !targetUserId) {
              setError(CLIP_SAVE_FAILURE_MESSAGE);
              return;
            }
            const { clip, nextSequenceNumber, exceededSoftCap } = await persistRecordedClip({
              clipIdSequence: clipIdSequenceRef.current,
              sessionId: targetSessionId,
              userId: targetUserId,
              blob,
              recorderMimeType: recorder.mimeType,
              durationSeconds,
            });
            clipIdSequenceRef.current = nextSequenceNumber;
            setClips((currentClips) => [...currentClips, clip]);
            if (exceededSoftCap) {
              setError(STORAGE_SOFT_CAP_MESSAGE);
            }
          } catch {
            setError(CLIP_SAVE_FAILURE_MESSAGE);
          } finally {
            stopStream(streamRef.current);
            streamRef.current = null;
            mediaRecorderRef.current = null;
            recordingSessionIdRef.current = null;
            recordingStartRef.current = null;
            setElapsedSeconds(0);
            setIsRecording(false);
          }
        })();
      };
      recorder.start();
      perfMark("capture:record:active");
      perfMeasure("capture:record:tap_to_stream_ms", "capture:record:tap", "capture:record:stream_ready");
      perfMeasure("capture:record:tap_to_active_ms", "capture:record:tap", "capture:record:active");
      setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds((currentSeconds) => currentSeconds + 1);
      }, 1000);
      durationLimitRef.current = window.setTimeout(() => {
        setError(CLIP_LENGTH_LIMIT_REACHED_MESSAGE);
        stopRecording();
      }, MAX_VOICE_CLIP_DURATION_SECONDS * 1000);
    } catch {
      stopTimer();
      clearDurationLimitTimer();
      stopStream(streamRef.current);
      streamRef.current = null;
      mediaRecorderRef.current = null;
      recordingSessionIdRef.current = null;
      setIsRecording(false);
      setError("Microphone access was denied or unavailable.");
    }
  }, [clearDurationLimitTimer, isRecording, isSupported, stopRecording, stopTimer]);
  useEffect(() => {
    const clipUrlById = clipUrlByIdRef.current;
    return () => {
      stopTimer();
      clearDurationLimitTimer();
      stopStream(streamRef.current);
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      clipUrlById.forEach((objectUrl) => {
        revokeClipUrl(objectUrl);
      });
      clipUrlById.clear();
    };
  }, [clearDurationLimitTimer, stopTimer]);
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
