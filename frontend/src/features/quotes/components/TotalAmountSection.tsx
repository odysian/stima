import { formatCurrency } from "@/shared/lib/formatters";

interface TotalAmountSectionProps {
  lineItemSum: number;
  total: number | null;
  disabled?: boolean;
  onTotalChange: (value: number | null) => void;
}

export function TotalAmountSection({
  lineItemSum,
  total,
  disabled = false,
  onTotalChange,
}: TotalAmountSectionProps): React.ReactElement {
  return (
    <section className="rounded-lg bg-surface-container-low p-4">
      <div className="flex items-center justify-between text-sm text-outline">
        <span>Line Item Sum</span>
        <span>{formatCurrency(lineItemSum)}</span>
      </div>
      <div className="mt-4 border-t border-outline-variant/30 pt-4">
        <label
          htmlFor="quote-total"
          className="block text-xs font-bold uppercase tracking-widest text-on-surface"
        >
          TOTAL AMOUNT
        </label>
        <div className="relative mt-2">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-primary">
            $
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
            className="w-full rounded-lg border-2 border-primary bg-white py-3 pl-10 pr-4 font-headline text-3xl font-bold tracking-tight text-primary outline-none transition-all focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>
    </section>
  );
}
