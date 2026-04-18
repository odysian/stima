import type { PointerEvent as ReactPointerEvent } from "react";

import { resolveLineItemFlagMessage } from "@/features/quotes/utils/lineItemFlags";
import { OverflowMenu, type OverflowMenuItem } from "@/shared/components/OverflowMenu";

interface LineItemCardProps {
  description: string;
  details: string | null;
  price: number | null;
  flagged?: boolean;
  flagReason?: string | null;
  disabled?: boolean;
  isDragging?: boolean;
  ariaLabel?: string;
  onEdit: () => void;
  onDelete: () => void;
  onDragHandlePointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  dragHandleAriaLabel?: string;
}

export function LineItemCard({
  description,
  details,
  price,
  flagged = false,
  flagReason,
  disabled = false,
  isDragging = false,
  ariaLabel,
  onEdit,
  onDelete,
  onDragHandlePointerDown,
  dragHandleAriaLabel,
}: LineItemCardProps): React.ReactElement {
  const lineItemLabel = description.trim() || "Untitled line item";
  const priceLabel = price !== null ? `$${price.toFixed(2)}` : "—";
  const flagMessage = flagged ? resolveLineItemFlagMessage(flagReason) : null;
  const overflowItems: OverflowMenuItem[] = [
    {
      label: "Edit",
      icon: "edit",
      disabled,
      onSelect: onEdit,
    },
    {
      label: "Delete",
      icon: "delete",
      tone: "destructive",
      disabled,
      onSelect: onDelete,
    },
  ];

  return (
    <div
      className={`flex w-full items-start gap-3 rounded-xl bg-surface-container-lowest p-3 ghost-shadow transition-all ${
        flagged ? "border border-warning-accent/20" : ""
      } ${
        isDragging ? "ring-2 ring-primary/30" : ""
      }`}
    >
      <button
        type="button"
        aria-label={dragHandleAriaLabel ?? `Reorder line item ${lineItemLabel}`}
        disabled={disabled}
        className="mt-1 inline-flex h-9 w-9 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded-full border border-outline-variant/30 text-outline transition-colors hover:bg-surface-container-low active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-60"
        onPointerDown={onDragHandlePointerDown}
      >
        <span className="material-symbols-outlined text-[1.125rem] leading-none">drag_indicator</span>
      </button>

      <button
        type="button"
        aria-label={ariaLabel}
        disabled={disabled}
        className="flex min-w-0 flex-1 cursor-pointer items-start justify-between gap-3 rounded-lg p-1 text-left transition-colors hover:bg-surface-container-low/70 disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onEdit}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-bold text-on-surface">{description}</p>
            {flagged ? (
              <span className="rounded bg-warning-container px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wide text-warning">
                REVIEW
              </span>
            ) : null}
          </div>
          {details ? <p className="mt-0.5 text-sm text-on-surface-variant">{details}</p> : null}
          {flagMessage ? (
            <p
              title={flagMessage}
              className="mt-1 inline-flex max-w-full items-center gap-1 text-xs text-warning"
            >
              <span className="material-symbols-outlined text-[0.95rem] leading-none">info</span>
              <span className="truncate">{flagMessage}</span>
            </p>
          ) : null}
        </div>

        <div className="mt-0.5 flex shrink-0 items-center gap-2">
          <p className="font-bold text-on-surface">{priceLabel}</p>
          <span className="material-symbols-outlined text-outline">chevron_right</span>
        </div>
      </button>

      <OverflowMenu items={overflowItems} triggerLabel={`Line item actions for ${lineItemLabel}`} />
    </div>
  );
}
