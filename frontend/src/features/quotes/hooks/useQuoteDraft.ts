import { useCallback, useState } from "react";

import type { LineItemDraftWithFlags, QuoteSourceType } from "@/features/quotes/types/quote.types";
import type { DiscountType } from "@/shared/lib/pricing";

const DRAFT_STORAGE_KEY = "stima_quote_draft";

export interface QuoteDraft {
  customerId: string;
  launchOrigin?: string;
  title: string;
  transcript: string;
  lineItems: LineItemDraftWithFlags[];
  total: number | null;
  taxRate: number | null;
  discountType: DiscountType | null;
  discountValue: number | null;
  depositAmount: number | null;
  confidenceNotes: string[];
  notes: string;
  sourceType: QuoteSourceType;
}

type QuoteDraftUpdater = QuoteDraft | ((current: QuoteDraft) => QuoteDraft);

interface UseQuoteDraftResult {
  draft: QuoteDraft | null;
  setDraft: (nextDraft: QuoteDraftUpdater) => void;
  updateLineItem: (index: number, item: LineItemDraftWithFlags) => void;
  removeLineItem: (index: number) => void;
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
      launchOrigin,
      title,
      transcript,
      lineItems,
      total,
      taxRate,
      discountType,
      discountValue,
      depositAmount,
      confidenceNotes,
      notes,
      sourceType,
    } = parsed;

    if (
      typeof customerId !== "string" ||
      (launchOrigin !== undefined && typeof launchOrigin !== "string") ||
      (title !== undefined && typeof title !== "string") ||
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
    if (taxRate !== undefined && taxRate !== null && typeof taxRate !== "number") {
      return null;
    }
    if (
      discountType !== undefined
      && discountType !== null
      && discountType !== "fixed"
      && discountType !== "percent"
    ) {
      return null;
    }
    if (discountValue !== undefined && discountValue !== null && typeof discountValue !== "number") {
      return null;
    }
    if (depositAmount !== undefined && depositAmount !== null && typeof depositAmount !== "number") {
      return null;
    }

    const parsedSourceType: QuoteSourceType =
      sourceType === "voice" || sourceType === "text" ? sourceType : "text";

    return {
      customerId,
      launchOrigin: typeof launchOrigin === "string" ? launchOrigin : "/",
      title: typeof title === "string" ? title : "",
      transcript,
      lineItems: lineItems as LineItemDraftWithFlags[],
      total,
      taxRate: typeof taxRate === "number" ? taxRate : null,
      discountType: discountType === "fixed" || discountType === "percent" ? discountType : null,
      discountValue: typeof discountValue === "number" ? discountValue : null,
      depositAmount: typeof depositAmount === "number" ? depositAmount : null,
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

  const setDraft = useCallback((nextDraft: QuoteDraftUpdater) => {
    setDraftState((currentDraft) => {
      const resolvedDraft =
        typeof nextDraft === "function"
          ? (currentDraft ? nextDraft(currentDraft) : currentDraft)
          : nextDraft;

      if (!resolvedDraft) {
        return currentDraft;
      }

      persistDraftToStorage(resolvedDraft);
      return resolvedDraft;
    });
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

      const nextDraft: QuoteDraft = {
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

      const nextDraft: QuoteDraft = {
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
