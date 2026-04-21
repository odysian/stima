import { useState } from "react";

import { PricingRow } from "@/shared/components/PricingRow";
import { formatCurrency } from "@/shared/lib/formatters";
import { calculatePricingFromSubtotal, parseTaxPercentInput, toTaxPercentDisplay, type DiscountType } from "@/shared/lib/pricing";
import { Eyebrow } from "@/ui/Eyebrow";

interface TotalAmountSectionProps {
  lineItemSum: number;
  total: number | null;
  taxRate: number | null;
  discountType: DiscountType | null;
  discountValue: number | null;
  depositAmount: number | null;
  suggestedTaxRate?: number | null;
  disabled?: boolean;
  onTotalChange: (value: number | null) => void;
  onTaxRateChange: (value: number | null) => void;
  onDiscountTypeChange: (value: DiscountType | null) => void;
  onDiscountValueChange: (value: number | null) => void;
  onDepositAmountChange: (value: number | null) => void;
}

export function TotalAmountSection({
  lineItemSum,
  total,
  taxRate,
  discountType,
  discountValue,
  depositAmount,
  suggestedTaxRate = null,
  disabled = false,
  onTotalChange,
  onTaxRateChange,
  onDiscountTypeChange,
  onDiscountValueChange,
  onDepositAmountChange,
}: TotalAmountSectionProps): React.ReactElement {
  const [discountToggleOverride, setDiscountToggleOverride] = useState<boolean | null>(null);
  const [taxToggleOverride, setTaxToggleOverride] = useState<boolean | null>(null);
  const [depositToggleOverride, setDepositToggleOverride] = useState<boolean | null>(null);
  const [isOptionalPricingOpen, setIsOptionalPricingOpen] = useState(false);
  const isDiscountEnabled = discountToggleOverride ?? (
    discountType !== null || hasActivePricingValue(discountValue)
  );
  const isTaxEnabled = taxToggleOverride ?? hasActivePricingValue(taxRate);
  const isDepositEnabled = depositToggleOverride ?? hasActivePricingValue(depositAmount);

  const pricingBreakdown = calculatePricingFromSubtotal({
    totalAmount: total,
    taxRate,
    discountType,
    discountValue,
    depositAmount,
  });
  const hasActiveOptionalPricing = isDiscountEnabled || isTaxEnabled || isDepositEnabled;
  const hasPricingBreakdown = pricingBreakdown.hasPricingBreakdown;
  const shouldShowOptionalPricingPanel = hasActiveOptionalPricing || isOptionalPricingOpen;

  return (
    <section className="rounded-[var(--radius-document)] bg-surface-container-low p-4">
      <div className="flex items-center justify-between text-sm text-outline">
        <span>Line Item Sum</span>
        <span>{formatCurrency(lineItemSum)}</span>
      </div>
      <div className="mt-4 border-t border-outline-variant/30 pt-4">
        <label htmlFor="quote-total" className="block">
          <Eyebrow className="text-on-surface">{hasPricingBreakdown ? "SUBTOTAL" : "TOTAL AMOUNT"}</Eyebrow>
        </label>
        <div className="relative mt-2">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-primary">
            $
          </span>
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-base leading-none text-on-surface-variant">
            <span className="material-symbols-outlined text-base">edit</span>
          </span>
          <input
            id="quote-total"
            type="number"
            step="0.01"
            disabled={disabled}
            value={total ?? ""}
            onChange={(event) => {
              const rawValue = event.target.value.trim();
              if (rawValue.length === 0) {
                onTotalChange(null);
                return;
              }

              const parsedValue = Number(rawValue);
              onTotalChange(Number.isFinite(parsedValue) ? parsedValue : null);
            }}
            className="w-full rounded-[var(--radius-document)] border-2 border-primary bg-surface-container-high py-3 pl-10 pr-12 font-headline text-3xl font-bold tracking-tight text-on-surface outline-none transition-all focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <div className="mt-4 border-t border-outline-variant/30 pt-4">
        {hasActiveOptionalPricing ? (
          <div className="flex items-center justify-between gap-4 rounded-[var(--radius-document)] bg-surface-container-lowest px-4 py-3">
            <div>
              <Eyebrow className="text-on-surface">Optional Pricing</Eyebrow>
              <p className="mt-1 text-sm text-outline">
                Tax, discount, and deposit
              </p>
            </div>
            <span className="material-symbols-outlined text-outline">
              expand_more
            </span>
          </div>
        ) : (
          <button
            type="button"
            aria-expanded={isOptionalPricingOpen}
            aria-controls="optional-pricing-panel"
            className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-[var(--radius-document)] bg-surface-container-lowest px-4 py-3 text-left transition-colors hover:bg-surface-container"
            onClick={() => setIsOptionalPricingOpen((current) => !current)}
          >
            <div>
              <Eyebrow className="text-on-surface">Optional Pricing</Eyebrow>
              <p className="mt-1 text-sm text-outline">
                Tax, discount, and deposit
              </p>
            </div>
            <span className="material-symbols-outlined text-outline">
              {isOptionalPricingOpen ? "expand_more" : "chevron_right"}
            </span>
          </button>
        )}

        {shouldShowOptionalPricingPanel ? (
          <div id="optional-pricing-panel" className="mt-4 space-y-3">
            <label className="flex items-center gap-3 text-sm text-on-surface">
              <input
                type="checkbox"
                checked={isDiscountEnabled}
                disabled={disabled}
                onChange={(event) => {
                  if (event.target.checked) {
                    setDiscountToggleOverride(true);
                    onDiscountTypeChange(discountType ?? "fixed");
                    if (discountValue === 0) {
                      onDiscountValueChange(null);
                    }
                    return;
                  }
                  setDiscountToggleOverride(false);
                  onDiscountTypeChange(null);
                  onDiscountValueChange(null);
                }}
              />
              Discount
            </label>
            {isDiscountEnabled ? (
              <div className="grid gap-3 md:grid-cols-[minmax(0,140px)_1fr]">
                <select
                  value={discountType ?? "fixed"}
                  disabled={disabled}
                  onChange={(event) => onDiscountTypeChange(event.target.value as DiscountType)}
                  className="w-full rounded-[var(--radius-document)] bg-surface-container-high px-4 py-3 text-sm text-on-surface transition-all focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="fixed">Fixed $</option>
                  <option value="percent">Percent %</option>
                </select>
                <input
                  type="number"
                  step="0.01"
                  disabled={disabled}
                  value={discountValue ?? ""}
                  onChange={(event) => {
                    const nextValue = event.target.value.trim();
                    onDiscountValueChange(nextValue.length > 0 ? Number(nextValue) : null);
                  }}
                  className="w-full rounded-[var(--radius-document)] bg-surface-container-high px-4 py-3 text-sm text-on-surface transition-all focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder={discountType === "percent" ? "10" : "25"}
                />
              </div>
            ) : null}

            <label className="flex items-center gap-3 text-sm text-on-surface">
              <input
                type="checkbox"
                checked={isTaxEnabled}
                disabled={disabled}
                onChange={(event) => {
                  if (event.target.checked) {
                    setTaxToggleOverride(true);
                    onTaxRateChange(taxRate ?? suggestedTaxRate ?? null);
                    return;
                  }
                  setTaxToggleOverride(false);
                  onTaxRateChange(null);
                }}
              />
              Tax
            </label>
            {isTaxEnabled ? (
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  aria-label="Tax rate (%)"
                  disabled={disabled}
                  value={toTaxPercentDisplay(taxRate)}
                  onChange={(event) => onTaxRateChange(parseTaxPercentInput(event.target.value))}
                  className="w-full rounded-[var(--radius-document)] bg-surface-container-high px-4 py-3 pr-10 text-sm text-on-surface transition-all focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="8.25"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-outline">
                  %
                </span>
              </div>
            ) : null}

            <label className="flex items-center gap-3 text-sm text-on-surface">
              <input
                type="checkbox"
                checked={isDepositEnabled}
                disabled={disabled}
                onChange={(event) => {
                  if (event.target.checked) {
                    setDepositToggleOverride(true);
                    if (depositAmount === 0) {
                      onDepositAmountChange(null);
                    }
                    return;
                  }
                  setDepositToggleOverride(false);
                  onDepositAmountChange(null);
                }}
              />
              Deposit
            </label>
            {isDepositEnabled ? (
              <input
                type="number"
                step="0.01"
                disabled={disabled}
                value={depositAmount ?? ""}
                onChange={(event) => {
                  const nextValue = event.target.value.trim();
                  onDepositAmountChange(nextValue.length > 0 ? Number(nextValue) : null);
                }}
                className="w-full rounded-[var(--radius-document)] bg-surface-container-high px-4 py-3 text-sm text-on-surface transition-all focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="50"
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {hasPricingBreakdown ? (
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
  );
}

function hasActivePricingValue(value: number | null): boolean {
  return value !== null;
}
