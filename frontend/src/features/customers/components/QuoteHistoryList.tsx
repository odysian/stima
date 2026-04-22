import type { QuoteListItem } from "@/features/quotes/types/quote.types";
import { formatCurrency, formatDate } from "@/shared/lib/formatters";
import { EmptyState } from "@/ui/EmptyState";
import { Eyebrow } from "@/ui/Eyebrow";
import { StatusPill } from "@/ui/StatusPill";

interface QuoteHistoryListProps {
  quotes: QuoteListItem[];
  onQuoteClick: (quoteId: string) => void;
  timezone?: string | null;
  showHeader?: boolean;
}

export function QuoteHistoryList({
  quotes,
  onQuoteClick,
  timezone,
  showHeader = true,
}: QuoteHistoryListProps): React.ReactElement {
  const quoteCountLabel = `${quotes.length} ${quotes.length === 1 ? "QUOTE" : "QUOTES"}`;

  return (
    <section>
      {showHeader ? (
        <div className="mb-2 flex items-center justify-between">
          <Eyebrow>Quote History</Eyebrow>
          <Eyebrow>{quoteCountLabel}</Eyebrow>
        </div>
      ) : null}

      {quotes.length > 0 ? (
        <div className="rounded-[var(--radius-document)] bg-surface-container-low p-3">
          <ul className="flex flex-col gap-3">
            {quotes.map((quote) => {
              const itemCountLabel = `${quote.item_count} ${quote.item_count === 1 ? "item" : "items"}`;
              const primaryLabel = quote.title ?? quote.doc_number;
              const supportingDetails = [
                ...(quote.title ? [quote.doc_number] : []),
                formatDate(quote.created_at, timezone),
                itemCountLabel,
              ].join(" · ");

              return (
                <li key={quote.id}>
                  <button
                    type="button"
                    className="w-full cursor-pointer rounded-[var(--radius-document)] bg-surface-container-lowest p-4 text-left ghost-shadow transition active:scale-[0.98] active:bg-surface-container-low"
                    onClick={() => onQuoteClick(quote.id)}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-headline font-bold text-on-surface">{primaryLabel}</p>
                      <p className="font-headline font-bold text-on-surface">
                        {formatCurrency(quote.total_amount)}
                      </p>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="text-sm text-on-surface-variant">{supportingDetails}</p>
                      <StatusPill variant={quote.status} />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <EmptyState icon="description" title="No quotes yet." />
      )}
    </section>
  );
}
