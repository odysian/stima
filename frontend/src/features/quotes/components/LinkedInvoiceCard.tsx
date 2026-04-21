import type { LinkedInvoiceSummary } from "@/features/quotes/types/quote.types";
import { Eyebrow } from "@/ui/Eyebrow";
import { StatusPill } from "@/ui/StatusPill";
import { formatCurrency, formatDate } from "@/shared/lib/formatters";

interface LinkedInvoiceCardProps {
  linkedInvoice: LinkedInvoiceSummary | null;
  timezone?: string | null;
  onOpenInvoice: (invoiceId: string) => void;
}

export function LinkedInvoiceCard({
  linkedInvoice,
  timezone,
  onOpenInvoice,
}: LinkedInvoiceCardProps): React.ReactElement | null {
  if (!linkedInvoice) {
    return null;
  }

  const dueDateLabel = linkedInvoice.due_date
    ? `Due ${formatDate(`${linkedInvoice.due_date}T00:00:00.000Z`, timezone)}`
    : "No due date";

  return (
    <section className="mt-3 px-4">
      <button
        type="button"
        onClick={() => onOpenInvoice(linkedInvoice.id)}
        aria-label={`Open linked invoice ${linkedInvoice.doc_number}`}
        className="ghost-shadow flex w-full cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-document)] border border-outline-variant/30 bg-surface-container-lowest px-4 py-3 text-left transition-all hover:bg-surface-container-low active:scale-[0.99]"
      >
        <div className="min-w-0">
          <Eyebrow>Linked Invoice</Eyebrow>
          <p className="mt-1.5 font-semibold text-on-surface">
            {linkedInvoice.doc_number}
          </p>
          <p className="mt-1 text-sm text-on-surface-variant">
            {[dueDateLabel, formatCurrency(linkedInvoice.total_amount)].join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-2 pl-2">
          <StatusPill variant={linkedInvoice.status} />
          <span className="material-symbols-outlined text-on-surface-variant">arrow_forward</span>
        </div>
      </button>
    </section>
  );
}
