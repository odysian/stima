import { PricingRow } from "@/features/quotes/components/PricingRow";
import { formatCurrency } from "@/shared/lib/formatters";
import { calculatePricingFromPersisted, resolveLineItemSum, type DiscountType } from "@/shared/lib/pricing";

interface QuoteDetailsCardProps {
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
      <section className="ghost-shadow rounded-lg border-l-4 border-primary bg-surface-container-lowest p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">CLIENT</h2>
            <p className="mt-2 font-bold text-on-surface">{clientName}</p>
            <p className="mt-1 text-sm text-on-surface-variant">{clientContact}</p>
          </div>

          <div className="shrink-0 text-right">
            <h2 className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
              {pricingBreakdown.hasPricingBreakdown ? "TOTAL" : "TOTAL AMOUNT"}
            </h2>
            <p className="mt-2 font-headline text-2xl font-bold text-primary">
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
