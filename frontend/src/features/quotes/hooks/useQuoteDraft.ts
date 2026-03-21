import { useCallback, useState } from "react";

import type { LineItemDraftWithFlags, QuoteSourceType } from "@/features/quotes/types/quote.types";

const DRAFT_STORAGE_KEY = "stima_quote_draft";

export interface QuoteDraft {
  customerId: string;
  transcript: string;
  lineItems: LineItemDraftWithFlags[];
  total: number | null;
  confidenceNotes: string[];
  notes: string;
  sourceType: QuoteSourceType;
}

interface UseQuoteDraftResult {
  draft: QuoteDraft | null;
  setDraft: (nextDraft: QuoteDraft) => void;
  clearDraft: () => void;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseStoredDraft(raw: string | null): QuoteDraft | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) {
      return null;
    }

    const {
      customerId,
      transcript,
      lineItems,
      total,
      confidenceNotes,
      notes,
      sourceType,
    } = parsed;

    if (
      typeof customerId !== "string" ||
      typeof transcript !== "string" ||
      !Array.isArray(lineItems) ||
      !Array.isArray(confidenceNotes) ||
      typeof notes !== "string"
    ) {
      return null;
    }

    if (total !== null && typeof total !== "number") {
      return null;
    }

    const parsedSourceType: QuoteSourceType =
      sourceType === "voice" || sourceType === "text" ? sourceType : "text";

    return {
      customerId,
      transcript,
      lineItems: lineItems as LineItemDraftWithFlags[],
      total,
      confidenceNotes: confidenceNotes.filter(
        (entry): entry is string => typeof entry === "string",
      ),
      notes,
      sourceType: parsedSourceType,
    };
  } catch {
    return null;
  }
}

function readDraftFromStorage(): QuoteDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  return parseStoredDraft(window.sessionStorage.getItem(DRAFT_STORAGE_KEY));
}

function persistDraftToStorage(draft: QuoteDraft): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

function removeDraftFromStorage(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
}

export function useQuoteDraft(): UseQuoteDraftResult {
  const [draft, setDraftState] = useState<QuoteDraft | null>(() => readDraftFromStorage());

  const setDraft = useCallback((nextDraft: QuoteDraft) => {
    persistDraftToStorage(nextDraft);
    setDraftState(nextDraft);
  }, []);

  const clearDraft = useCallback(() => {
    removeDraftFromStorage();
    setDraftState(null);
  }, []);

  return {
    draft,
    setDraft,
    clearDraft,
  };
}
