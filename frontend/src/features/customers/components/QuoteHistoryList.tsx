import type { QuoteListItem } from "@/features/quotes/types/quote.types";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { formatCurrency, formatDate } from "@/shared/lib/formatters";

interface QuoteHistoryListProps {
  quotes: QuoteListItem[];
  onQuoteClick: (quoteId: string) => void;
}

export function QuoteHistoryList({
  quotes,
  onQuoteClick,
}: QuoteHistoryListProps): React.ReactElement {
  const quoteCountLabel = `${quotes.length} ${quotes.length === 1 ? "QUOTE" : "QUOTES"}`;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
          Quote History
        </p>
        <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
          {quoteCountLabel}
        </p>
      </div>

      {quotes.length > 0 ? (
        <div className="rounded-xl bg-surface-container-low p-3">
          <ul className="flex flex-col gap-3">
            {quotes.map((quote) => {
              const itemCountLabel = `${quote.item_count} ${quote.item_count === 1 ? "item" : "items"}`;

              return (
                <li key={quote.id}>
                  <button
                    type="button"
                    className="w-full rounded-xl bg-surface-container-lowest p-4 text-left ghost-shadow transition active:scale-[0.98] active:bg-surface-container-low"
                    onClick={() => onQuoteClick(quote.id)}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-headline font-bold text-on-surface">{quote.doc_number}</p>
                      <p className="font-headline font-bold text-on-surface">
                        {formatCurrency(quote.total_amount)}
                      </p>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="text-sm text-on-surface-variant">
                        {formatDate(quote.created_at)}{" · "}{itemCountLabel}
                      </p>
                      <StatusBadge variant={quote.status} />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="rounded-lg bg-surface-container-lowest p-4 text-sm text-outline ghost-shadow">
          No quotes yet.
        </p>
      )}
    </section>
  );
}
