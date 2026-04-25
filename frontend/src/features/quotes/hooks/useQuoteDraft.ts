import { useCallback, useEffect, useRef, useState } from "react";

import type { LineItemDraftWithFlags, QuoteSourceType } from "@/features/quotes/types/quote.types";
import {
  buildCaptureHandoffDraftKey,
  CAPTURE_HANDOFF_DOCUMENT_ID,
  deleteLocalDraft,
  saveLocalDraft,
} from "@/features/quotes/offline/draftRepository";
import { readQuoteDraftFromIDB } from "@/features/quotes/hooks/quoteDraftPersistence";
import type { DiscountType } from "@/shared/lib/pricing";

const DRAFT_PERSIST_DEBOUNCE_MS = 200;

export interface QuoteDraft {
  quoteId?: string;
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
  notes: string;
  sourceType: QuoteSourceType;
}

type QuoteDraftUpdater = QuoteDraft | ((current: QuoteDraft) => QuoteDraft);

interface UseQuoteDraftResult {
  draft: QuoteDraft | null;
  isLoading: boolean;
  setDraft: (nextDraft: QuoteDraftUpdater) => void;
  updateLineItem: (index: number, item: LineItemDraftWithFlags) => void;
  removeLineItem: (index: number) => void;
  clearDraft: () => void;
}

export function useQuoteDraft(userId: string | undefined): UseQuoteDraftResult {
  const [draft, setDraftState] = useState<QuoteDraft | null>(null);
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const persistTimerRef = useRef<number | null>(null);

  const persistDraft = useCallback((nextDraft: QuoteDraft) => {
    if (!userId) {
      return;
    }

    void saveLocalDraft({
      draftKey: buildCaptureHandoffDraftKey(userId),
      userId,
      docType: "capture_handoff",
      documentId: CAPTURE_HANDOFF_DOCUMENT_ID,
      payload: nextDraft,
    }).catch((error) => {
      console.warn("Unable to persist quote draft locally.", error);
    });
  }, [userId]);

  const scheduleDraftPersist = useCallback((nextDraft: QuoteDraft) => {
    if (!userId || typeof window === "undefined") {
      return;
    }

    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }

    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      persistDraft(nextDraft);
    }, DRAFT_PERSIST_DEBOUNCE_MS);
  }, [persistDraft, userId]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(persistTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (persistTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
  }, [userId]);

  useEffect(() => {
    let isActive = true;

    void Promise.resolve()
      .then(async () => {
        if (!userId) {
          return {
            nextDraft: null as QuoteDraft | null,
            nextHydratedUserId: null as string | null,
          };
        }

        try {
          const persistedDraft = await readQuoteDraftFromIDB(userId);
          return {
            nextDraft: persistedDraft,
            nextHydratedUserId: userId,
          };
        } catch (error) {
          console.warn("Unable to hydrate quote draft from local storage.", error);
          return {
            nextDraft: null as QuoteDraft | null,
            nextHydratedUserId: userId,
          };
        }
      })
      .then(({ nextDraft, nextHydratedUserId }) => {
        if (!isActive) {
          return;
        }
        setDraftState(nextDraft);
        setHydratedUserId(nextHydratedUserId);
      });

    return () => {
      isActive = false;
    };
  }, [userId]);

  const isLoading = typeof userId === "string" && hydratedUserId !== userId;

  const setDraft = useCallback((nextDraft: QuoteDraftUpdater) => {
    setDraftState((currentDraft) => {
      const resolvedDraft =
        typeof nextDraft === "function"
          ? (currentDraft ? nextDraft(currentDraft) : currentDraft)
          : nextDraft;

      if (!resolvedDraft) {
        return currentDraft;
      }

      scheduleDraftPersist(resolvedDraft);
      return resolvedDraft;
    });
  }, [scheduleDraftPersist]);

  const clearDraft = useCallback(() => {
    if (persistTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    if (userId) {
      void deleteLocalDraft(buildCaptureHandoffDraftKey(userId)).catch((error) => {
        console.warn("Unable to clear quote draft.", error);
      });
    }
    setDraftState(null);
  }, [userId]);

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
      scheduleDraftPersist(nextDraft);
      return nextDraft;
    });
  }, [scheduleDraftPersist]);

  const removeLineItem = useCallback((index: number) => {
    setDraftState((currentDraft) => {
      if (!currentDraft || index < 0 || index >= currentDraft.lineItems.length) {
        return currentDraft;
      }

      const nextDraft: QuoteDraft = {
        ...currentDraft,
        lineItems: currentDraft.lineItems.filter((_, currentIndex) => currentIndex !== index),
      };
      scheduleDraftPersist(nextDraft);
      return nextDraft;
    });
  }, [scheduleDraftPersist]);

  const scopedDraft = userId && hydratedUserId === userId ? draft : null;

  return {
    draft: scopedDraft,
    isLoading,
    setDraft,
    updateLineItem,
    removeLineItem,
    clearDraft,
  };
}
