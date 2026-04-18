import { LineItemCard } from "@/features/quotes/components/LineItemCard";
import type { LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";
import { DOCUMENT_LINE_ITEMS_MAX_ITEMS } from "@/shared/lib/inputLimits";

interface ReviewLineItemsSectionProps {
  lineItems: LineItemDraftWithFlags[];
  isInteractionLocked: boolean;
  onEditLineItem: (index: number) => void;
  onAddLineItem: () => void;
}

export function ReviewLineItemsSection({
  lineItems,
  isInteractionLocked,
  onEditLineItem,
  onAddLineItem,
}: ReviewLineItemsSectionProps): React.ReactElement {
  const hasReachedLineItemLimit = lineItems.length >= DOCUMENT_LINE_ITEMS_MAX_ITEMS;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between">
        <h2 className="font-headline text-xl font-bold tracking-tight text-primary">Line Items</h2>
        <span className="text-[0.6875rem] uppercase tracking-widest text-outline">
          {lineItems.length} ITEMS
        </span>
      </div>

      <div className="space-y-2.5">
        {lineItems.length > 0 ? (
          lineItems.map((lineItem, index) => {
            const displayDescription = lineItem.description || "Untitled line item";
            return (
              <LineItemCard
                key={`review-line-item-${index}`}
                ariaLabel={`Edit line item ${index + 1}: ${displayDescription}`}
                description={displayDescription}
                details={lineItem.details}
                price={lineItem.price}
                flagged={lineItem.flagged}
                disabled={isInteractionLocked}
                onClick={() => onEditLineItem(index)}
              />
            );
          })
        ) : (
          <p className="rounded-lg bg-surface-container-lowest p-4 text-sm text-outline">
            No line items on this quote yet.
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-1">
        <button
          type="button"
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-outline-variant/30 py-3 text-sm text-on-surface-variant transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isInteractionLocked || hasReachedLineItemLimit}
          onClick={onAddLineItem}
        >
          <span className="material-symbols-outlined text-base">add</span>
          Add Line Item
        </button>
      </div>

      {hasReachedLineItemLimit ? (
        <p className="text-xs text-outline">
          You can include up to {DOCUMENT_LINE_ITEMS_MAX_ITEMS} line items per document.
        </p>
      ) : null}
    </section>
  );
}
