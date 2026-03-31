import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteDetail } from "@/features/quotes/types/quote.types";

interface UseQuoteDetailResult {
  quote: QuoteDetail | null;
  setQuote: Dispatch<SetStateAction<QuoteDetail | null>>;
  isLoadingQuote: boolean;
  loadError: string | null;
  refetchQuote: (quoteId: string) => Promise<void>;
}

export function useQuoteDetail(quoteId: string | undefined): UseQuoteDetailResult {
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function refetchQuote(nextQuoteId: string): Promise<void> {
    const refreshedQuote = await quoteService.getQuote(nextQuoteId);
    setQuote(refreshedQuote);
  }

  useEffect(() => {
    if (!quoteId) {
      setLoadError("Missing quote id.");
      setIsLoadingQuote(false);
      return;
    }
    const currentQuoteId = quoteId;

    let isActive = true;

    async function fetchQuote(): Promise<void> {
      setIsLoadingQuote(true);
      setLoadError(null);
      try {
        const fetchedQuote = await quoteService.getQuote(currentQuoteId);
        if (isActive) {
          setQuote(fetchedQuote);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load quote";
        if (isActive) {
          setLoadError(message);
        }
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

  return {
    quote,
    setQuote,
    isLoadingQuote,
    loadError,
    refetchQuote,
  };
}
