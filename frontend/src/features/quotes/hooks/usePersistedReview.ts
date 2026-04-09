import { useCallback, useEffect, useState } from "react";

import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteDetail } from "@/features/quotes/types/quote.types";
import { isQuoteEditableStatus } from "@/features/quotes/utils/quoteStatus";
import { useQuoteEdit, type QuoteEditDraft } from "@/features/quotes/hooks/useQuoteEdit";
import {
  calculatePricingFromPersisted,
  resolveLineItemSum,
} from "@/shared/lib/pricing";

function mapQuoteToEditDraft(quote: QuoteDetail): QuoteEditDraft {
  const lineItemSum = resolveLineItemSum(quote.line_items.map((item) => item.price));
  const breakdown = calculatePricingFromPersisted(
    {
      totalAmount: quote.total_amount,
      taxRate: quote.tax_rate,
      discountType: quote.discount_type,
      discountValue: quote.discount_value,
      depositAmount: quote.deposit_amount,
    },
    lineItemSum,
  );

  return {
    quoteId: quote.id,
    title: quote.title?.trim() ?? "",
    transcript: quote.transcript,
    lineItems: quote.line_items.map((item) => ({
      description: item.description,
      details: item.details,
      price: item.price,
    })),
    total: breakdown.subtotal ?? quote.total_amount,
    taxRate: quote.tax_rate,
    discountType: quote.discount_type,
    discountValue: quote.discount_value,
    depositAmount: quote.deposit_amount,
    notes: quote.notes ?? "",
  };
}

interface UsePersistedReviewResult {
  quote: QuoteDetail | null;
  draft: QuoteEditDraft | null;
  setDraft: (nextDraft: QuoteEditDraft | ((current: QuoteEditDraft) => QuoteEditDraft)) => void;
  clearDraft: () => void;
  isLoadingQuote: boolean;
  loadError: string | null;
  refreshQuote: () => Promise<QuoteDetail>;
}

export function usePersistedReview(quoteId: string | undefined): UsePersistedReviewResult {
  const { draft, setDraft, clearDraft } = useQuoteEdit();
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshQuote = useCallback(async (): Promise<QuoteDetail> => {
    if (!quoteId) {
      throw new Error("Missing quote id.");
    }

    const refreshedQuote = await quoteService.getQuote(quoteId);
    setQuote(refreshedQuote);
    return refreshedQuote;
  }, [quoteId]);

  useEffect(() => {
    let isActive = true;

    async function fetchQuote(): Promise<void> {
      if (!quoteId) {
        setLoadError("Missing quote id.");
        setIsLoadingQuote(false);
        return;
      }

      setIsLoadingQuote(true);
      setLoadError(null);

      try {
        const fetchedQuote = await quoteService.getQuote(quoteId);
        if (!isActive) {
          return;
        }

        if (!isQuoteEditableStatus(fetchedQuote.status)) {
          setQuote(null);
          setLoadError("This quote can no longer be edited.");
          setIsLoadingQuote(false);
          return;
        }

        setQuote(fetchedQuote);
      } catch (error) {
        if (!isActive) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unable to load quote";
        setLoadError(message);
      } finally {
        if (isActive) {
          setIsLoadingQuote(false);
        }
      }
    }

    void fetchQuote();

    return () => {
      isActive = false;
    };
  }, [quoteId]);

  useEffect(() => {
    if (!quote) {
      return;
    }

    if (!draft || draft.quoteId !== quote.id) {
      setDraft(mapQuoteToEditDraft(quote));
      return;
    }

    if (typeof draft.transcript !== "string") {
      setDraft((currentDraft) => ({
        ...currentDraft,
        transcript: quote.transcript,
      }));
    }
  }, [draft, quote, setDraft]);

  const currentDraft = draft && quote && draft.quoteId === quote.id ? draft : null;

  return {
    quote,
    draft: currentDraft,
    setDraft,
    clearDraft,
    isLoadingQuote,
    loadError,
    refreshQuote,
  };
}
