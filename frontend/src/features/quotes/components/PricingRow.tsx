import { formatCurrency } from "@/shared/lib/formatters";

export function PricingRow({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: number | null;
  emphasized?: boolean;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={emphasized ? "font-semibold text-on-surface" : "text-on-surface-variant"}>
        {label}
      </span>
      <span className={emphasized ? "font-semibold text-on-surface" : "text-on-surface"}>
        {value !== null ? formatCurrency(value) : "TBD"}
      </span>
    </div>
  );
}
