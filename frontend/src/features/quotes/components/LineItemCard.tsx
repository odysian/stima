interface LineItemCardProps {
  description: string;
  details: string | null;
  price: number | null;
  flagged?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  onClick: () => void;
}

export function LineItemCard({
  description,
  details,
  price,
  flagged = false,
  disabled = false,
  ariaLabel,
  onClick,
}: LineItemCardProps): React.ReactElement {
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
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-primary">Edit</span>
        {price != null ? <p className="font-bold text-on-surface">${price.toFixed(2)}</p> : null}
        <span className="material-symbols-outlined text-outline">chevron_right</span>
      </div>
    </button>
  );
}
