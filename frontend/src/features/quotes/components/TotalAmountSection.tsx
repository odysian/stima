import { useState } from "react";

import { PricingRow } from "@/shared/components/PricingRow";
import { formatCurrency } from "@/shared/lib/formatters";
import { calculatePricingFromSubtotal, parseTaxPercentInput, toTaxPercentDisplay, type DiscountType } from "@/shared/lib/pricing";
import { Eyebrow } from "@/ui/Eyebrow";
import { AppIcon } from "@/ui/Icon";
import { NumericField } from "@/ui/NumericField";

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
        <Eyebrow className="text-on-surface">{hasPricingBreakdown ? "SUBTOTAL" : "TOTAL AMOUNT"}</Eyebrow>
        <div className="mt-2">
          <NumericField
            id="quote-total"
            label="Total amount"
            hideLabel
            step={0.01}
            disabled={disabled}
            value={total === null ? "" : total.toString()}
            onChange={(rawValue) => {
              const normalizedValue = rawValue.replaceAll(",", "").trim();
              if (normalizedValue.length === 0) {
                onTotalChange(null);
                return;
              }

              const parsedValue = Number(normalizedValue);
              onTotalChange(Number.isFinite(parsedValue) ? parsedValue : null);
            }}
            showStepControls={false}
            formatOnBlur={false}
            currencySymbol="$"
            currencySymbolClassName="!text-2xl !font-bold text-primary"
            trailingAdornment={(
              <AppIcon name="edit" className="pointer-events-none !text-base leading-none text-on-surface-variant" />
            )}
            fieldClassName="!min-h-[72px] !border-2 !border-primary !bg-surface-container-high !px-4 !py-3 focus-within:!ring-2 focus-within:!ring-focus-ring"
            className="!font-headline !text-3xl !font-bold !tracking-tight text-primary"
          />
        </div>
      </div>

      <div className="mt-4 border-t border-outline-variant/30 pt-4">
        {hasActiveOptionalPricing ? (
          <div className="flex items-center justify-between gap-4 rounded-[var(--radius-document)] border border-outline-variant/25 bg-surface-container-high/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div>
              <Eyebrow className="text-on-surface">Optional Pricing</Eyebrow>
              <p className="mt-1 text-sm text-on-surface-variant">
                Tax, discount, and deposit
              </p>
            </div>
            <AppIcon name="expand_more" className="text-on-surface-variant" />
          </div>
        ) : (
          <button
            type="button"
            aria-expanded={isOptionalPricingOpen}
            aria-controls="optional-pricing-panel"
            className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-[var(--radius-document)] border border-outline-variant/25 bg-surface-container-high/80 px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all hover:border-outline-variant/40 hover:bg-surface-container-high"
            onClick={() => setIsOptionalPricingOpen((current) => !current)}
          >
            <div>
              <Eyebrow className="text-on-surface">Optional Pricing</Eyebrow>
              <p className="mt-1 text-sm text-on-surface-variant">
                Tax, discount, and deposit
              </p>
            </div>
            <AppIcon
              name={isOptionalPricingOpen ? "expand_less" : "expand_more"}
              className="text-on-surface-variant"
            />
          </button>
        )}

        {shouldShowOptionalPricingPanel ? (
          <div
            id="optional-pricing-panel"
            className="mt-4 space-y-3 rounded-[var(--radius-document)] bg-surface-container-lowest/60 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
          >
            <section className="rounded-[var(--radius-document)] border border-outline-variant/20 bg-surface-container-high/60 p-3">
              <label className={`flex select-none items-center gap-3 text-sm text-on-surface ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
                <input
                  type="checkbox"
                  className="peer sr-only"
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
                <span className="relative inline-flex h-5 w-9 shrink-0 rounded-full bg-outline-variant/40 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 peer-disabled:opacity-50 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-surface-container-lowest after:shadow-sm after:transition-transform peer-checked:after:translate-x-4" />
                <span className="font-semibold">Discount</span>
              </label>
              {isDiscountEnabled ? (
                <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,140px)_1fr]">
                  <div className="relative">
                    <select
                      value={discountType ?? "fixed"}
                      disabled={disabled}
                      onChange={(event) => onDiscountTypeChange(event.target.value as DiscountType)}
                      style={{ colorScheme: "var(--select-color-scheme)" }}
                      className="w-full appearance-none rounded-[var(--radius-document)] border border-outline-variant/30 bg-surface-container-high px-4 py-3 pr-12 text-sm text-on-surface transition-all focus:border-primary/40 focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-focus-ring"
                    >
                      <option value="fixed">Fixed $</option>
                      <option value="percent">Percent %</option>
                    </select>
                    <span className="pointer-events-none absolute inset-y-0 right-3 inline-flex items-center text-sm text-outline">
                      <AppIcon name="expand_more" className="block text-sm leading-none" />
                    </span>
                  </div>
                  <NumericField
                    label="Discount value"
                    hideLabel
                    step={0.01}
                    disabled={disabled}
                    value={String(discountValue ?? "")}
                    onChange={(v) => onDiscountValueChange(v.trim() ? Number(v) : null)}
                    showStepControls={false}
                    formatOnBlur={false}
                    placeholder={discountType === "percent" ? "10" : "25"}
                  />
                </div>
              ) : null}
            </section>

            <section className="rounded-[var(--radius-document)] border border-outline-variant/20 bg-surface-container-high/60 p-3">
              <label className={`flex select-none items-center gap-3 text-sm text-on-surface ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
                <input
                  type="checkbox"
                  className="peer sr-only"
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
                <span className="relative inline-flex h-5 w-9 shrink-0 rounded-full bg-outline-variant/40 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 peer-disabled:opacity-50 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-surface-container-lowest after:shadow-sm after:transition-transform peer-checked:after:translate-x-4" />
                <span className="font-semibold">Tax</span>
              </label>
              {isTaxEnabled ? (
                <div className="mt-3">
                  <NumericField
                    label="Tax rate (%)"
                    hideLabel
                    step={0.01}
                    disabled={disabled}
                    value={toTaxPercentDisplay(taxRate)}
                    onChange={(v) => onTaxRateChange(parseTaxPercentInput(v))}
                    showStepControls={false}
                    formatOnBlur={false}
                    placeholder="8.25"
                    trailingAdornment={<span className="text-sm text-outline">%</span>}
                  />
                </div>
              ) : null}
            </section>

            <section className="rounded-[var(--radius-document)] border border-outline-variant/20 bg-surface-container-high/60 p-3">
              <label className={`flex select-none items-center gap-3 text-sm text-on-surface ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
                <input
                  type="checkbox"
                  className="peer sr-only"
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
                <span className="relative inline-flex h-5 w-9 shrink-0 rounded-full bg-outline-variant/40 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 peer-disabled:opacity-50 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-surface-container-lowest after:shadow-sm after:transition-transform peer-checked:after:translate-x-4" />
                <span className="font-semibold">Deposit</span>
              </label>
              {isDepositEnabled ? (
                <div className="mt-3">
                  <NumericField
                    label="Deposit amount"
                    hideLabel
                    step={0.01}
                    disabled={disabled}
                    value={String(depositAmount ?? "")}
                    onChange={(v) => onDepositAmountChange(v.trim() ? Number(v) : null)}
                    showStepControls={false}
                    formatOnBlur={false}
                    placeholder="50"
                  />
                </div>
              ) : null}
            </section>
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
