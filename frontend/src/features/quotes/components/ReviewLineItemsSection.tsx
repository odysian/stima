import { useRef, useState } from "react";

import { LineItemCard } from "@/features/quotes/components/LineItemCard";
import type { LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";
import { DOCUMENT_LINE_ITEMS_MAX_ITEMS } from "@/shared/lib/inputLimits";

interface ReviewLineItemsSectionProps {
  lineItems: LineItemDraftWithFlags[];
  isInteractionLocked: boolean;
  onEditLineItem: (index: number) => void;
  onRequestDeleteLineItem: (index: number) => void;
  onReorderLineItems: (sourceIndex: number, targetIndex: number) => void;
  onAddLineItem: () => void;
}

export function ReviewLineItemsSection({
  lineItems,
  isInteractionLocked,
  onEditLineItem,
  onRequestDeleteLineItem,
  onReorderLineItems,
  onAddLineItem,
}: ReviewLineItemsSectionProps): React.ReactElement {
  const hasReachedLineItemLimit = lineItems.length >= DOCUMENT_LINE_ITEMS_MAX_ITEMS;
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const draggingIndexRef = useRef<number | null>(null);

  function resolveRowIndexFromPoint(clientX: number, clientY: number): number | null {
    const row = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("[data-line-item-index]");
    if (!row) {
      return null;
    }
    const rawIndex = row.dataset.lineItemIndex;
    if (typeof rawIndex !== "string") {
      return null;
    }
    const parsedIndex = Number.parseInt(rawIndex, 10);
    if (!Number.isInteger(parsedIndex) || parsedIndex < 0 || parsedIndex >= lineItems.length) {
      return null;
    }
    return parsedIndex;
  }

  function clearDragState(): void {
    draggingIndexRef.current = null;
    setDraggingIndex(null);
  }

  function handleDragHandlePointerDown(
    index: number,
    event: React.PointerEvent<HTMLButtonElement>,
  ): void {
    if (isInteractionLocked) {
      return;
    }

    event.preventDefault();

    const pointerId = event.pointerId;
    const handleElement = event.currentTarget;
    draggingIndexRef.current = index;
    setDraggingIndex(index);

    handleElement.setPointerCapture(pointerId);

    function handlePointerMove(pointerEvent: PointerEvent): void {
      const sourceIndex = draggingIndexRef.current;
      if (sourceIndex === null) {
        return;
      }

      const targetIndex = resolveRowIndexFromPoint(pointerEvent.clientX, pointerEvent.clientY);
      if (targetIndex === null || targetIndex === sourceIndex) {
        return;
      }

      onReorderLineItems(sourceIndex, targetIndex);
      draggingIndexRef.current = targetIndex;
      setDraggingIndex(targetIndex);
    }

    function stopPointerTracking(): void {
      handleElement.removeEventListener("pointermove", handlePointerMove);
      handleElement.removeEventListener("pointerup", stopPointerTracking);
      handleElement.removeEventListener("pointercancel", stopPointerTracking);
      handleElement.removeEventListener("lostpointercapture", stopPointerTracking);
      clearDragState();
    }

    handleElement.addEventListener("pointermove", handlePointerMove);
    handleElement.addEventListener("pointerup", stopPointerTracking);
    handleElement.addEventListener("pointercancel", stopPointerTracking);
    handleElement.addEventListener("lostpointercapture", stopPointerTracking);
  }

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
              <div key={`review-line-item-${index}`} data-line-item-index={index}>
                <LineItemCard
                  ariaLabel={`Edit line item ${index + 1}: ${displayDescription}`}
                  dragHandleAriaLabel={`Reorder line item ${index + 1}: ${displayDescription}`}
                  description={displayDescription}
                  details={lineItem.details}
                  price={lineItem.price}
                  flagged={lineItem.flagged}
                  flagReason={lineItem.flagReason}
                  disabled={isInteractionLocked}
                  isDragging={draggingIndex === index}
                  onEdit={() => onEditLineItem(index)}
                  onDelete={() => onRequestDeleteLineItem(index)}
                  onDragHandlePointerDown={(event) => handleDragHandlePointerDown(index, event)}
                />
              </div>
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
