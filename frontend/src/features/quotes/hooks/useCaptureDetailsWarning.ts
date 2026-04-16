import { useCallback, useMemo, useState } from "react";

import type { ExtractionReviewHiddenDetails, HiddenItemState } from "@/features/quotes/types/quote.types";
import {
  buildCaptureDetailsFingerprint,
  hasUndismissedCaptureDetailsItems,
  resolveCaptureDetailsActionableItems,
} from "@/features/quotes/utils/captureDetails";

function buildCaptureDetailsFingerprintStorageKey(documentId: string): string {
  return `stima_capture_details_fingerprint:${documentId}`;
}

interface UseCaptureDetailsWarningParams {
  documentId: string;
  isQuoteDocument: boolean;
  hiddenDetails?: ExtractionReviewHiddenDetails;
  hiddenDetailState?: Record<string, HiddenItemState>;
}

interface UseCaptureDetailsWarningResult {
  shouldWarnOnContinue: boolean;
  markCaptureDetailsOpened: () => void;
}

export function useCaptureDetailsWarning({
  documentId,
  isQuoteDocument,
  hiddenDetails,
  hiddenDetailState,
}: UseCaptureDetailsWarningParams): UseCaptureDetailsWarningResult {
  const [openedFingerprintOverrides, setOpenedFingerprintOverrides] = useState<Record<string, string>>({});
  const captureDetailsItems = useMemo(
    () => resolveCaptureDetailsActionableItems(hiddenDetails),
    [hiddenDetails],
  );
  const captureDetailsFingerprint = useMemo(
    () => buildCaptureDetailsFingerprint(captureDetailsItems),
    [captureDetailsItems],
  );
  const hasUndismissedCaptureDetails = useMemo(
    () => hasUndismissedCaptureDetailsItems(captureDetailsItems, hiddenDetailState),
    [captureDetailsItems, hiddenDetailState],
  );
  const lastOpenedCaptureDetailsFingerprint = useMemo(() => {
    if (!documentId) {
      return "";
    }
    if (Object.prototype.hasOwnProperty.call(openedFingerprintOverrides, documentId)) {
      return openedFingerprintOverrides[documentId] ?? "";
    }
    return window.localStorage.getItem(buildCaptureDetailsFingerprintStorageKey(documentId)) ?? "";
  }, [documentId, openedFingerprintOverrides]);

  const markCaptureDetailsOpened = useCallback(() => {
    if (!documentId) {
      return;
    }
    setOpenedFingerprintOverrides((current) => ({
      ...current,
      [documentId]: captureDetailsFingerprint,
    }));
    window.localStorage.setItem(
      buildCaptureDetailsFingerprintStorageKey(documentId),
      captureDetailsFingerprint,
    );
  }, [captureDetailsFingerprint, documentId]);

  return {
    shouldWarnOnContinue: isQuoteDocument
      && hasUndismissedCaptureDetails
      && captureDetailsFingerprint !== lastOpenedCaptureDetailsFingerprint,
    markCaptureDetailsOpened,
  };
}
