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
    <div className="mt-4 flex flex-col gap-3 px-4 pb-6">
      <section className="ghost-shadow rounded-lg border-l-4 border-primary bg-surface-container-lowest p-4">
        <h2 className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
          TOTAL AMOUNT
        </h2>
        <p className="mt-2 font-headline text-2xl font-bold text-primary">
          {formatCurrency(totalAmount)}
        </p>
      </section>

      <section className="ghost-shadow rounded-lg border-l-4 border-teal-500 bg-surface-container-lowest p-4">
        <h2 className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">CLIENT</h2>
        <p className="mt-2 font-bold text-on-surface">{clientName}</p>
        <p className="mt-1 text-sm text-on-surface-variant">{clientContact}</p>
      </section>
    </div>
  );
}
