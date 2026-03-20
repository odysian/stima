import { useCallback, useEffect, useState } from "react";

import type { LineItemDraft } from "@/features/quotes/types/quote.types";

const DRAFT_STORAGE_KEY = "stima_quote_draft";

export interface QuoteDraft {
  customerId: string;
  transcript: string;
  lineItems: LineItemDraft[];
  total: number | null;
  confidenceNotes: string[];
  notes: string;
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

    return {
      customerId,
      transcript,
      lineItems: lineItems as LineItemDraft[],
      total,
      confidenceNotes: confidenceNotes.filter(
        (entry): entry is string => typeof entry === "string",
      ),
      notes,
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

export function useQuoteDraft(): UseQuoteDraftResult {
  const [draft, setDraftState] = useState<QuoteDraft | null>(() => readDraftFromStorage());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (draft === null) {
      window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [draft]);

  const setDraft = useCallback((nextDraft: QuoteDraft) => {
    setDraftState(nextDraft);
  }, []);

  const clearDraft = useCallback(() => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    }
    setDraftState(null);
  }, []);

  return {
    draft,
    setDraft,
    clearDraft,
  };
}
