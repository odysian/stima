import type { DiscountType } from "@/shared/lib/pricing";
import { PricingRow } from "@/shared/components/PricingRow";
import { formatCurrency, formatDate } from "@/shared/lib/formatters";
import { calculatePricingFromPersisted, resolveLineItemSum } from "@/shared/lib/pricing";
import { Eyebrow } from "@/ui/Eyebrow";
import { StatusPill, type StatusPillVariant } from "@/ui/StatusPill";

interface DocumentHeroCardProps {
  documentLabel: "QUOTE" | "INVOICE";
  status: StatusPillVariant;
  clientName: string;
  clientContact: string;
  totalAmount: number | null;
  taxRate: number | null;
  discountType: DiscountType | null;
  discountValue: number | null;
  depositAmount: number | null;
  lineItemPrices: Array<number | null>;
  dueDate?: string | null;
  linkedDocument?: {
    actionLabel: string;
    actionAriaLabel?: string;
    onClick: () => void;
  } | null;
}

export function DocumentHeroCard({
  documentLabel,
  status,
  clientName,
  clientContact,
  totalAmount,
  taxRate,
  discountType,
  discountValue,
  depositAmount,
  lineItemPrices,
  dueDate,
  linkedDocument = null,
}: DocumentHeroCardProps): React.ReactElement {
  const pricingBreakdown = calculatePricingFromPersisted(
    {
      totalAmount,
      taxRate,
      discountType,
      discountValue,
      depositAmount,
    },
    resolveLineItemSum(lineItemPrices),
  );
  const dueDateLabel = dueDate ? formatDate(`${dueDate}T00:00:00.000Z`) : "No due date";

  return (
    <div className="mt-4 px-4 pb-6">
      <section className="ghost-shadow rounded-[var(--radius-document)] border-l-4 border-primary bg-surface-container-lowest p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4">
          <div className="min-w-0">
            <Eyebrow>CLIENT</Eyebrow>
            <p className="mt-0.5 font-bold text-on-surface">{clientName}</p>
            <p className="mt-1 text-sm text-on-surface-variant">{clientContact}</p>

            {documentLabel === "INVOICE" ? (
              <div className="mt-3">
                <Eyebrow>DUE DATE</Eyebrow>
                <p className="mt-2 text-sm text-on-surface">{dueDateLabel}</p>
              </div>
            ) : null}

            {linkedDocument ? (
              <button
                type="button"
                className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-primary"
                aria-label={linkedDocument.actionAriaLabel ?? linkedDocument.actionLabel}
                onClick={linkedDocument.onClick}
              >
                {linkedDocument.actionLabel}
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </button>
            ) : null}
          </div>

          <div className="self-end justify-self-end text-right">
            <p className="font-headline text-[1.625rem] font-bold leading-none tracking-[0.12em] text-on-surface sm:text-[1.75rem]">
              {documentLabel}
            </p>
            <div className="mt-2">
              <StatusPill variant={status} />
            </div>

            <div className="mt-4">
              <Eyebrow>
                {pricingBreakdown.hasPricingBreakdown ? "TOTAL" : "TOTAL AMOUNT"}
              </Eyebrow>
            </div>
            <p className="mt-1 font-headline text-2xl font-bold text-primary">
              {formatCurrency(totalAmount)}
            </p>
          </div>
        </div>

        {pricingBreakdown.hasPricingBreakdown ? (
          <div className="mt-4 space-y-2 border-t border-outline-variant/30 pt-4 text-sm">
            <PricingRow label="Subtotal" value={pricingBreakdown.subtotal} />
            {pricingBreakdown.discountAmount !== null ? (
              <PricingRow label="Discount" value={-pricingBreakdown.discountAmount} />
            ) : null}
            {pricingBreakdown.taxAmount !== null ? (
              <PricingRow label="Tax" value={pricingBreakdown.taxAmount} />
            ) : null}
            <PricingRow label="Total" value={pricingBreakdown.totalAmount} emphasized />
            {pricingBreakdown.depositAmount !== null ? (
              <>
                <PricingRow label="Deposit" value={pricingBreakdown.depositAmount} />
                <PricingRow label="Balance Due" value={pricingBreakdown.balanceDue} emphasized />
              </>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
