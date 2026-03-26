import { formatCurrency } from "@/shared/lib/formatters";

interface QuoteDetailsCardProps {
  totalAmount: number | null;
  clientName: string;
  clientContact: string;
}

export function QuoteDetailsCard({
  totalAmount,
  clientName,
  clientContact,
}: QuoteDetailsCardProps): React.ReactElement {
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
              TOTAL AMOUNT
            </h2>
            <p className="mt-2 font-headline text-2xl font-bold text-primary">
              {formatCurrency(totalAmount)}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
