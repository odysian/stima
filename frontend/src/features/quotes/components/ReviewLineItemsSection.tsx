import { LineItemCard } from "@/features/quotes/components/LineItemCard";
import type { LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";
import { DOCUMENT_LINE_ITEMS_MAX_ITEMS } from "@/shared/lib/inputLimits";

interface ReviewLineItemsSectionProps {
  lineItems: LineItemDraftWithFlags[];
  isInteractionLocked: boolean;
  onEditLineItem: (index: number) => void;
  onCaptureMoreNotes?: () => void;
  showCaptureMoreNotes?: boolean;
  onAddLineItem: () => void;
}

export function ReviewLineItemsSection({
  lineItems,
  isInteractionLocked,
  onEditLineItem,
  onCaptureMoreNotes,
  showCaptureMoreNotes = true,
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
                priceStatus={lineItem.priceStatus}
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

      <div className={`grid gap-3 ${showCaptureMoreNotes ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}>
        <button
          type="button"
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-outline-variant/30 py-3 text-sm text-on-surface-variant transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isInteractionLocked || hasReachedLineItemLimit}
          onClick={onAddLineItem}
        >
          <span className="material-symbols-outlined text-base">add</span>
          Add Line Item
        </button>

        {showCaptureMoreNotes ? (
          <button
            type="button"
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/5 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isInteractionLocked}
            onClick={() => onCaptureMoreNotes?.()}
          >
            <span className="material-symbols-outlined text-base">mic</span>
            Capture More Notes
          </button>
        ) : null}
      </div>

      {hasReachedLineItemLimit ? (
        <p className="text-xs text-outline">
          You can include up to {DOCUMENT_LINE_ITEMS_MAX_ITEMS} line items per document.
        </p>
      ) : null}
    </section>
  );
}
