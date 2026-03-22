interface LineItemCardProps {
  description: string;
  details: string | null;
  price: number | null;
  flagged?: boolean;
  onClick: () => void;
}

export function LineItemCard({
  description,
  details,
  price,
  flagged = false,
  onClick,
}: LineItemCardProps): React.ReactElement {
  return (
    <button
      type="button"
      className={`w-full bg-surface-container-lowest rounded-lg p-4 ghost-shadow text-left flex items-start justify-between gap-3 active:scale-[0.99] transition-all ${
        flagged ? "border border-amber-500/20" : ""
      }`}
      onClick={onClick}
    >
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-bold text-on-surface">{description}</p>
          {flagged ? (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wide text-amber-700">
              REVIEW
            </span>
          ) : null}
        </div>
        {details ? <p className="mt-0.5 text-sm text-on-surface-variant">{details}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {price != null ? <p className="font-bold text-on-surface">${price.toFixed(2)}</p> : null}
        <span className="material-symbols-outlined text-outline">chevron_right</span>
      </div>
    </button>
  );
}
