import { useEffect, useRef, useState } from "react";

import { LineItemCard } from "@/features/quotes/components/LineItemCard";
import type { LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";
import { DOCUMENT_LINE_ITEMS_MAX_ITEMS } from "@/shared/lib/inputLimits";
import { AppIcon } from "@/ui/Icon";

interface ReviewLineItemsSectionProps {
  lineItems: LineItemDraftWithFlags[];
  isInteractionLocked: boolean;
  onEditLineItem: (index: number) => void;
  onReorderLineItems: (sourceIndex: number, targetIndex: number) => void;
  onAddLineItem: () => void;
}

export function ReviewLineItemsSection({
  lineItems,
  isInteractionLocked,
  onEditLineItem,
  onReorderLineItems,
  onAddLineItem,
}: ReviewLineItemsSectionProps): React.ReactElement {
  const hasReachedLineItemLimit = lineItems.length >= DOCUMENT_LINE_ITEMS_MAX_ITEMS;
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [settlingIndex, setSettlingIndex] = useState<number | null>(null);
  const draggingIndexRef = useRef<number | null>(null);
  const settleTimeoutRef = useRef<number | null>(null);
  const isReorderModeActive = isReorderMode && !isInteractionLocked;

  useEffect(() => () => {
    if (settleTimeoutRef.current !== null) {
      window.clearTimeout(settleTimeoutRef.current);
    }
  }, []);

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

  function clearDragState(options?: { settle?: boolean }): void {
    const draggedIndex = draggingIndexRef.current;
    draggingIndexRef.current = null;
    setDraggingIndex(null);
    if (settleTimeoutRef.current !== null) {
      window.clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }
    if (options?.settle && draggedIndex !== null) {
      setSettlingIndex(draggedIndex);
      settleTimeoutRef.current = window.setTimeout(() => {
        setSettlingIndex(null);
        settleTimeoutRef.current = null;
      }, 180);
      return;
    }
    setSettlingIndex(null);
  }

  function handleDragHandlePointerDown(
    index: number,
    event: React.PointerEvent<HTMLButtonElement>,
  ): void {
    if (isInteractionLocked || !isReorderModeActive) {
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
      clearDragState({ settle: true });
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
        <button
          type="button"
          disabled={isInteractionLocked || (!isReorderModeActive && lineItems.length < 2)}
          className={`inline-flex min-h-9 items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
            isReorderModeActive
              ? "border-primary/30 bg-primary/15 text-primary ghost-shadow"
              : "border-outline-variant/35 bg-surface-container-high/80 text-on-surface-variant hover:border-outline-variant/50 hover:bg-surface-container-high"
          } disabled:cursor-not-allowed disabled:opacity-60`}
          onClick={() => {
            clearDragState();
            setIsReorderMode((currentMode) => !currentMode);
          }}
        >
          {isReorderModeActive ? "Done" : "Reorder"}
        </button>
      </div>

      <div className="space-y-2.5">
        {lineItems.length > 0 ? (
          lineItems.map((lineItem, index) => {
            const displayDescription = lineItem.description || "Untitled line item";
            const isDraggingRow = draggingIndex === index;
            return (
              <div
                key={`review-line-item-${index}`}
                data-line-item-index={index}
                className={`transition-transform duration-150 ease-out ${
                  isReorderModeActive && draggingIndex !== null && !isDraggingRow
                    ? (index < draggingIndex ? "-translate-y-1" : "translate-y-1")
                    : ""
                }`}
              >
                <LineItemCard
                  ariaLabel={`Edit line item ${index + 1}: ${displayDescription}`}
                  dragHandleAriaLabel={`Reorder line item ${index + 1}: ${displayDescription}`}
                  description={displayDescription}
                  details={lineItem.details}
                  price={lineItem.price}
                  flagged={lineItem.flagged}
                  flagReason={lineItem.flagReason}
                  disabled={isInteractionLocked}
                  isReorderMode={isReorderModeActive}
                  isDragging={isDraggingRow}
                  isDropSettling={settlingIndex === index}
                  onEdit={() => {
                    if (isReorderModeActive) {
                      return;
                    }
                    onEditLineItem(index);
                  }}
                  onDragHandlePointerDown={(event) => handleDragHandlePointerDown(index, event)}
                />
              </div>
            );
          })
        ) : (
          <p className="rounded-[var(--radius-document)] bg-surface-container-lowest p-4 text-sm text-outline">
            No line items on this quote yet.
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-1">
        <button
          type="button"
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-document)] border-2 border-dashed border-outline-variant/30 py-3 text-sm text-on-surface-variant transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isInteractionLocked || hasReachedLineItemLimit || isReorderModeActive}
          onClick={onAddLineItem}
        >
          <AppIcon name="add" className="text-base" />
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
