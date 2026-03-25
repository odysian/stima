import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteListItem } from "@/features/quotes/types/quote.types";
import { BottomNav } from "@/shared/components/BottomNav";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { Input } from "@/shared/components/Input";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { formatCurrency, formatDate } from "@/shared/lib/formatters";

export function QuoteList(): React.ReactElement {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [quotes, setQuotes] = useState<QuoteListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function fetchQuotes(): Promise<void> {
      setIsLoading(true);
      setLoadError(null);
      try {
        const nextQuotes = await quoteService.listQuotes();
        if (isActive) {
          setQuotes(nextQuotes);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load quotes";
        if (isActive) {
          setLoadError(message);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void fetchQuotes();

    return () => {
      isActive = false;
    };
  }, []);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredQuotes = useMemo(() => {
    if (!normalizedSearchQuery) {
      return quotes;
    }

    return quotes.filter((quote) => {
      const customerName = quote.customer_name.toLowerCase();
      const docNumber = quote.doc_number.toLowerCase();
      return (
        customerName.includes(normalizedSearchQuery) ||
        docNumber.includes(normalizedSearchQuery)
      );
    });
  }, [normalizedSearchQuery, quotes]);

  // Active: ready/shared quotes. Pending: draft quotes.
  const activeQuoteCount = useMemo(
    () => quotes.filter((quote) => quote.status === "ready" || quote.status === "shared").length,
    [quotes],
  );
  const pendingReviewCount = useMemo(
    () => quotes.filter((quote) => quote.status === "draft").length,
    [quotes],
  );
  const timezone = user?.timezone ?? null;

  return (
    <main className="min-h-screen bg-background pb-24">
      <section className="mx-auto w-full max-w-3xl py-2">
        <div className="px-4 pt-6 pb-4">
          <h1 className="font-headline text-2xl font-bold tracking-tight text-primary">
            Stima Quotes
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {activeQuoteCount} active {"\u00b7"} {pendingReviewCount} pending review
          </p>
        </div>

        <div className="mb-4 px-4">
          <Input
            label="Search quotes"
            id="quote-search"
            placeholder="Search customer or quote ID..."
            hideLabel
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>

        {isLoading ? (
          <p role="status" className="px-4 text-sm text-on-surface-variant">
            Loading quotes...
          </p>
        ) : null}

        {loadError ? (
          <div className="mx-4">
            <FeedbackMessage variant="error">{loadError}</FeedbackMessage>
          </div>
        ) : null}

        {!isLoading && !loadError && filteredQuotes.length === 0 ? (
          <section className="mx-4 mt-8 flex flex-col items-center rounded-lg bg-surface-container-lowest p-8 text-center ghost-shadow">
            <span className="material-symbols-outlined mb-2 text-3xl text-outline">description</span>
            <p className="text-sm text-outline">
              {quotes.length === 0
                ? "No quotes yet. Tap + to create your first."
                : "No quotes match your search."}
            </p>
          </section>
        ) : null}

        {!isLoading && !loadError && filteredQuotes.length > 0 ? (
          <>
            <div className="mb-2 flex items-center justify-between px-4">
              <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                PAST QUOTES
              </p>
              <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                Sorted by: Most Recent
              </p>
            </div>
            <div className="mx-4 rounded-xl bg-surface-container-low p-3">
              <ul className="flex flex-col gap-3">
                {filteredQuotes.map((quote) => (
                  <li key={quote.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/quotes/${quote.id}/preview`)}
                      className="w-full rounded-xl bg-surface-container-lowest p-4 text-left ghost-shadow transition active:scale-[0.98] active:bg-surface-container-low"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="font-headline font-bold text-on-surface">
                          {quote.customer_name}
                        </p>
                        <p className="font-headline font-bold text-on-surface">
                          {formatCurrency(quote.total_amount)}
                        </p>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <p className="text-sm text-on-surface-variant">
                          {quote.doc_number} {" \u00b7 "} {formatDate(quote.created_at, timezone)}{" "}
                          {"\u00b7"}{" "}
                          {quote.item_count} {quote.item_count === 1 ? "item" : "items"}
                        </p>
                        <StatusBadge variant={quote.status} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}
      </section>

      <button
        type="button"
        aria-label="Create quote"
        className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full forest-gradient text-white shadow-[0_0_24px_rgba(0,0,0,0.12)] transition-all active:scale-95"
        onClick={() => navigate("/quotes/new")}
      >
        <span className="material-symbols-outlined">add</span>
      </button>
      <BottomNav active="quotes" />
    </main>
  );
}
