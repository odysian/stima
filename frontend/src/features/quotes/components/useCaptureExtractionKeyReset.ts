import { useCallback, useEffect, useRef } from "react";

import { clearExtractionRequestIdempotencyKey } from "@/features/quotes/components/captureScreenIdempotency";

interface UseCaptureExtractionKeyResetParams {
  clips: { id: string; sizeBytes: number }[];
  notes: string;
  localSessionId: string | null;
  isRetryLockedByInFlightExtraction: boolean;
  setIsRetryLockedByInFlightExtraction: (value: boolean) => void;
  extractionIdempotencyKeyRef: { current: string | null };
  setNotes: (value: string) => void;
}

export function useCaptureExtractionKeyReset({
  clips,
  notes,
  localSessionId,
  isRetryLockedByInFlightExtraction,
  setIsRetryLockedByInFlightExtraction,
  extractionIdempotencyKeyRef,
  setNotes,
}: UseCaptureExtractionKeyResetParams): (value: string) => void {
  const previousClipSignatureRef = useRef("");

  useEffect(() => {
    const currentClipSignature = clips.map((clip) => `${clip.id}:${clip.sizeBytes}`).join("|");
    const hasChanged = previousClipSignatureRef.current !== currentClipSignature;
    previousClipSignatureRef.current = currentClipSignature;
    if (!hasChanged) {
      return;
    }
    if (!isRetryLockedByInFlightExtraction && extractionIdempotencyKeyRef.current === null) {
      return;
    }
    setIsRetryLockedByInFlightExtraction(false);
    void clearExtractionRequestIdempotencyKey(localSessionId, extractionIdempotencyKeyRef);
  }, [
    clips,
    extractionIdempotencyKeyRef,
    isRetryLockedByInFlightExtraction,
    localSessionId,
    setIsRetryLockedByInFlightExtraction,
  ]);

  useEffect(() => {
    setIsRetryLockedByInFlightExtraction(false);
  }, [notes, setIsRetryLockedByInFlightExtraction]);

  return useCallback((value: string): void => {
    if (value !== notes) {
      if (isRetryLockedByInFlightExtraction || extractionIdempotencyKeyRef.current !== null) {
        setIsRetryLockedByInFlightExtraction(false);
        void clearExtractionRequestIdempotencyKey(localSessionId, extractionIdempotencyKeyRef);
      }
    }
    setNotes(value);
  }, [
    extractionIdempotencyKeyRef,
    isRetryLockedByInFlightExtraction,
    localSessionId,
    notes,
    setIsRetryLockedByInFlightExtraction,
    setNotes,
  ]);
}
