import { useEffect } from "react";

import { subscribeLocalRecoveryChanged } from "@/features/quotes/offline/localRecoveryEvents";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteListItem } from "@/features/quotes/types/quote.types";

interface UseOutboxSuccessQuoteRefreshParams {
  userId: string | undefined;
  onQuotesLoaded: (quotes: QuoteListItem[]) => void;
  onLoadError: (error: string | null) => void;
}

export function useOutboxSuccessQuoteRefresh({
  userId,
  onQuotesLoaded,
  onLoadError,
}: UseOutboxSuccessQuoteRefreshParams): void {
  useEffect(() => {
    if (!userId) {
      return;
    }

    let isActive = true;
    const unsubscribe = subscribeLocalRecoveryChanged(userId, (event) => {
      if (event.reason !== "outbox_succeeded") {
        return;
      }

      void (async () => {
        try {
          const nextQuotes = await quoteService.listQuotes();
          if (isActive) {
            onLoadError(null);
            onQuotesLoaded(nextQuotes);
          }
        } catch (error) {
          if (!isActive) {
            return;
          }
          const message = error instanceof Error ? error.message : "Unable to load quotes";
          onLoadError(message);
        }
      })();
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [onLoadError, onQuotesLoaded, userId]);
}
