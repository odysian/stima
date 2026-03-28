import { formatCurrency } from "@/shared/lib/formatters";

import type { LineItem } from "@/features/quotes/types/quote.types";

interface QuoteLineItemsSectionProps {
  lineItems: LineItem[];
}

export function QuoteLineItemsSection({
  lineItems,
}: QuoteLineItemsSectionProps): React.ReactElement {
  return (
    <section className="mx-4 mt-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
          LINE ITEMS
        </h2>
        <span className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
          {lineItems.length} ITEMS
        </span>
      </div>
      <ul className="space-y-2">
        {lineItems.map((item) => (
          <li
            key={item.id}
            className="ghost-shadow flex items-start justify-between rounded-lg bg-surface-container-lowest p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-on-surface">{item.description}</p>
              {item.details ? (
                <p className="mt-1 text-sm text-on-surface-variant">{item.details}</p>
              ) : null}
            </div>
            <p className="ml-4 shrink-0 font-bold text-on-surface">
              {item.price !== null ? formatCurrency(item.price) : "TBD"}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
