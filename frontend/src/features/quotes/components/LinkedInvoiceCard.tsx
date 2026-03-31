import type { LinkedInvoiceSummary, QuoteStatus } from "@/features/quotes/types/quote.types";
import { Button } from "@/shared/components/Button";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { formatCurrency, formatDate } from "@/shared/lib/formatters";

interface LinkedInvoiceCardProps {
  quoteStatus: QuoteStatus;
  linkedInvoice: LinkedInvoiceSummary | null;
  timezone?: string | null;
  isConverting: boolean;
  onConvert: () => Promise<void>;
  onOpenInvoice: (invoiceId: string) => void;
}

export function LinkedInvoiceCard({
  quoteStatus,
  linkedInvoice,
  timezone,
  isConverting,
  onConvert,
  onOpenInvoice,
}: LinkedInvoiceCardProps): React.ReactElement | null {
  if (quoteStatus !== "approved") {
    return null;
  }

  return (
    <section className="mt-4 px-4 pb-2">
      <div className="ghost-shadow rounded-lg border border-success/20 bg-surface-container-lowest p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
              Linked Invoice
            </p>
            <p className="mt-2 font-bold text-on-surface">
              {linkedInvoice ? linkedInvoice.doc_number : "No invoice yet"}
            </p>
            <p className="mt-1 text-sm text-on-surface-variant">
              {linkedInvoice
                ? [
                    linkedInvoice.due_date
                      ? `Due ${formatDate(`${linkedInvoice.due_date}T00:00:00.000Z`, timezone)}`
                      : "No due date",
                    formatCurrency(linkedInvoice.total_amount),
                    `Created ${formatDate(linkedInvoice.created_at, timezone)}`,
                  ].join(" · ")
                : "Create the invoice from this won quote, then fine-tune the due date before sharing."}
            </p>
          </div>

          {linkedInvoice ? <StatusBadge variant={linkedInvoice.status} /> : null}
        </div>

        {linkedInvoice ? (
          <button
            type="button"
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary"
            onClick={() => onOpenInvoice(linkedInvoice.id)}
          >
            Open invoice
            <span className="material-symbols-outlined text-base">arrow_forward</span>
          </button>
        ) : (
          <Button
            type="button"
            className="mt-4 w-full"
            onClick={() => {
              void onConvert();
            }}
            isLoading={isConverting}
          >
            Convert to Invoice
          </Button>
        )}
      </div>
    </section>
  );
}
