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
        <ul>
          {quotes.map((quote) => (
            <li key={quote.id} className="mb-2 last:mb-0">
              <button
                type="button"
                className="w-full rounded-lg bg-surface-container-lowest p-4 text-left ghost-shadow transition active:scale-[0.99]"
                onClick={() => onQuoteClick(quote.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-headline font-bold text-on-surface">{quote.doc_number}</p>
                    <p className="mt-1 text-sm text-on-surface-variant">{formatDate(quote.created_at)}</p>
                  </div>
                  <StatusBadge variant={quote.status} />
                </div>
                <p className="mt-3 text-right font-bold text-on-surface">
                  {formatCurrency(quote.total_amount)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg bg-surface-container-lowest p-4 text-sm text-outline ghost-shadow">
          No quotes yet.
        </p>
      )}
    </section>
  );
}
