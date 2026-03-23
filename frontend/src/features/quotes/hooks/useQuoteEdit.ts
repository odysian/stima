import { useCallback, useState } from "react";

import type { LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";

const EDIT_STORAGE_KEY = "stima_quote_edit";

export interface QuoteEditDraft {
  quoteId: string;
  lineItems: LineItemDraftWithFlags[];
  total: number | null;
  notes: string;
}

interface UseQuoteEditResult {
  draft: QuoteEditDraft | null;
  setDraft: (nextDraft: QuoteEditDraft) => void;
  updateLineItem: (index: number, item: LineItemDraftWithFlags) => void;
  removeLineItem: (index: number) => void;
  clearDraft: () => void;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidLineItemDraft(value: unknown): value is LineItemDraftWithFlags {
  if (!isObject(value)) {
    return false;
  }

  const {
    description,
    details,
    price,
    flagged,
    flagReason,
  } = value;

  return (
    typeof description === "string" &&
    (details === null || details === undefined || typeof details === "string") &&
    (price === null || price === undefined || typeof price === "number") &&
    (flagged === undefined || typeof flagged === "boolean") &&
    (flagReason === undefined || flagReason === null || typeof flagReason === "string")
  );
}

function parseStoredDraft(raw: string | null): QuoteEditDraft | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) {
      return null;
    }

    const {
      quoteId,
      lineItems,
      total,
      notes,
    } = parsed;

    if (
      typeof quoteId !== "string" ||
      !Array.isArray(lineItems) ||
      typeof notes !== "string"
    ) {
      return null;
    }

    if (total !== null && typeof total !== "number") {
      return null;
    }

    if (!lineItems.every(isValidLineItemDraft)) {
      return null;
    }

    return {
      quoteId,
      lineItems,
      total,
      notes,
    };
  } catch {
    return null;
  }
}

function readDraftFromStorage(): QuoteEditDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  return parseStoredDraft(window.sessionStorage.getItem(EDIT_STORAGE_KEY));
}

function persistDraftToStorage(draft: QuoteEditDraft): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(EDIT_STORAGE_KEY, JSON.stringify(draft));
}

function removeDraftFromStorage(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(EDIT_STORAGE_KEY);
}

export function useQuoteEdit(): UseQuoteEditResult {
  const [draft, setDraftState] = useState<QuoteEditDraft | null>(() => readDraftFromStorage());

  const setDraft = useCallback((nextDraft: QuoteEditDraft) => {
    persistDraftToStorage(nextDraft);
    setDraftState(nextDraft);
  }, []);

  const clearDraft = useCallback(() => {
    removeDraftFromStorage();
    setDraftState(null);
  }, []);

  const updateLineItem = useCallback((index: number, item: LineItemDraftWithFlags) => {
    setDraftState((currentDraft) => {
      if (!currentDraft || index < 0 || index >= currentDraft.lineItems.length) {
        return currentDraft;
      }

      const nextDraft: QuoteEditDraft = {
        ...currentDraft,
        lineItems: currentDraft.lineItems.map((existingItem, currentIndex) =>
          currentIndex === index ? item : existingItem,
        ),
      };
      persistDraftToStorage(nextDraft);
      return nextDraft;
    });
  }, []);

  const removeLineItem = useCallback((index: number) => {
    setDraftState((currentDraft) => {
      if (!currentDraft || index < 0 || index >= currentDraft.lineItems.length) {
        return currentDraft;
      }

      const nextDraft: QuoteEditDraft = {
        ...currentDraft,
        lineItems: currentDraft.lineItems.filter((_, currentIndex) => currentIndex !== index),
      };
      persistDraftToStorage(nextDraft);
      return nextDraft;
    });
  }, []);

  return {
    draft,
    setDraft,
    updateLineItem,
    removeLineItem,
    clearDraft,
  };
}
