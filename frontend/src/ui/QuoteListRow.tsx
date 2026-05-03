import { formatCurrency } from "@/shared/lib/formatters";
import { StatusPill } from "@/ui/StatusPill";
import type { StatusPillVariant } from "@/ui/StatusPill";

interface QuoteListRowProps {
  customerLabel: string;
  titleLabel?: string | null;
  docAndDate: string;
  totalAmount: number | null;
  status: StatusPillVariant;
  isDraft?: boolean;
  needsCustomerAssignment?: boolean;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onClick: () => void;
}

const baseRowClasses =
  "w-full cursor-pointer rounded-[var(--radius-document)] bg-surface-container-lowest px-4 py-3 text-left ghost-shadow transition active:scale-[0.98] active:bg-surface-container-low";
const draftRowClasses =
  "bg-surface-container-low w-full cursor-pointer rounded-[var(--radius-document)] border-l-4 border-warning-accent px-4 py-3 text-left ghost-shadow transition active:scale-[0.98] active:bg-surface-container-high";
export function QuoteListRow({
  customerLabel,
  titleLabel,
  docAndDate,
  totalAmount,
  status,
  isDraft,
  needsCustomerAssignment,
  isSelectionMode,
  isSelected,
  onClick,
}: QuoteListRowProps): React.ReactElement {
  const selectedClassName = isSelected
    ? "ring-2 ring-selection-ring bg-selection-bg"
    : undefined;
  const layoutClassName = isSelectionMode ? "flex items-start gap-3" : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      className={[isDraft ? draftRowClasses : baseRowClasses, selectedClassName, layoutClassName].filter(Boolean).join(" ")}
    >
      {isSelectionMode ? (
        <span
          role="checkbox"
          aria-checked={isSelected === true}
          aria-label={`Select ${customerLabel}`}
          className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
            isSelected
              ? "border-primary bg-primary text-on-primary"
              : "border-outline-variant/60 bg-surface-container-lowest text-transparent"
          }`}
        >
          <span className="text-[0.75rem] leading-none">✓</span>
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-headline font-bold text-on-surface">{customerLabel}</p>
          <p className="font-headline font-bold text-on-surface">{formatCurrency(totalAmount)}</p>
        </div>
        <div className="mt-1 space-y-1">
          {titleLabel ? (
            <p className="text-sm text-on-surface-variant">{titleLabel}</p>
          ) : null}
          <div className="flex items-center gap-3">
            <p className="text-xs text-on-surface-variant">{docAndDate}</p>
            {needsCustomerAssignment ? (
              <span className="ml-auto">
                <StatusPill variant="needs_customer" />
              </span>
            ) : (
              <span className="ml-auto">
                <StatusPill variant={status} />
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
