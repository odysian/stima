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
  onClick: () => void;
}

const pillBase = "text-[0.6875rem] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full";

const baseRowClasses =
  "w-full cursor-pointer rounded-[var(--radius-document)] bg-surface-container-lowest px-4 py-3 text-left ghost-shadow transition active:scale-[0.98] active:bg-surface-container-low";
const draftRowClasses =
  "glass-surface w-full cursor-pointer rounded-[var(--radius-document)] border-l-4 border-warning-accent px-4 py-3 text-left backdrop-blur-md ghost-shadow transition active:scale-[0.98] active:bg-surface-container-low";
const needsCustomerPillClasses = `${pillBase} shrink-0 whitespace-nowrap bg-warning-container text-warning`;

export function QuoteListRow({
  customerLabel,
  titleLabel,
  docAndDate,
  totalAmount,
  status,
  isDraft,
  needsCustomerAssignment,
  onClick,
}: QuoteListRowProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={isDraft ? draftRowClasses : baseRowClasses}
    >
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
            <span className={`${needsCustomerPillClasses} ml-auto`}>Needs customer</span>
          ) : (
            <span className="ml-auto">
              <StatusPill variant={status} />
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
