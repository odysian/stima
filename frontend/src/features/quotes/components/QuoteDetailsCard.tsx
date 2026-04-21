import { Eyebrow } from "@/ui/Eyebrow";
import { PricingRow } from "@/shared/components/PricingRow";
import { formatCurrency } from "@/shared/lib/formatters";
import { calculatePricingFromPersisted, resolveLineItemSum, type DiscountType } from "@/shared/lib/pricing";

interface QuoteDetailsCardProps {
  documentLabel: "QUOTE" | "INVOICE";
  totalAmount: number | null;
  taxRate: number | null;
  discountType: DiscountType | null;
  discountValue: number | null;
  depositAmount: number | null;
  lineItemPrices: Array<number | null>;
  clientName: string;
  clientContact: string;
}

export function QuoteDetailsCard({
  documentLabel,
  totalAmount,
  taxRate,
  discountType,
  discountValue,
  depositAmount,
  lineItemPrices,
  clientName,
  clientContact,
}: QuoteDetailsCardProps): React.ReactElement {
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

  return (
    <div className="mt-4 px-4 pb-6">
      <section className="ghost-shadow rounded-[var(--radius-document)] border-l-4 border-primary bg-surface-container-lowest p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3">
          <div className="min-w-0">
            <Eyebrow>CLIENT</Eyebrow>
          </div>

          <div className="justify-self-end text-right">
            <p className="font-headline text-[1.625rem] font-bold leading-none tracking-[0.12em] text-on-surface sm:text-[1.75rem]">
              {documentLabel}
            </p>
          </div>

          <div className="min-w-0">
            <p className="font-bold text-on-surface">{clientName}</p>
            <p className="mt-1 text-sm text-on-surface-variant">{clientContact}</p>
          </div>

          <div className="self-end justify-self-end text-right">
            <Eyebrow>
              {pricingBreakdown.hasPricingBreakdown ? "TOTAL" : "TOTAL AMOUNT"}
            </Eyebrow>
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
