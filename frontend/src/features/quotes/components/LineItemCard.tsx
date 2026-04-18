import { resolveLineItemFlagMessage } from "@/features/quotes/utils/lineItemFlags";

interface LineItemCardProps {
  description: string;
  details: string | null;
  price: number | null;
  flagged?: boolean;
  flagReason?: string | null;
  disabled?: boolean;
  ariaLabel?: string;
  onClick: () => void;
}

export function LineItemCard({
  description,
  details,
  price,
  flagged = false,
  flagReason,
  disabled = false,
  ariaLabel,
  onClick,
}: LineItemCardProps): React.ReactElement {
  const priceLabel = price !== null ? `$${price.toFixed(2)}` : "—";
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      className={`flex w-full cursor-pointer items-start justify-between gap-3 rounded-xl bg-surface-container-lowest p-4 text-left ghost-shadow transition-all active:scale-[0.98] active:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-60 ${
        flagged ? "border border-warning-accent/20" : ""
      }`}
      onClick={onClick}
    >
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-bold text-on-surface">{description}</p>
          {flagged ? (
            <span className="rounded bg-warning-container px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wide text-warning">
              REVIEW
            </span>
          ) : null}
        </div>
        {details ? <p className="mt-0.5 text-sm text-on-surface-variant">{details}</p> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <p className="font-bold text-on-surface">{priceLabel}</p>
          <span className="material-symbols-outlined text-outline">chevron_right</span>
        </div>
        {flagged ? (
          <p className="max-w-[14rem] truncate text-right text-[0.6875rem] font-semibold uppercase tracking-wide text-warning">
            {resolveLineItemFlagMessage(flagReason)}
          </p>
        ) : null}
      </div>
    </button>
  );
}
