import type { LinkedInvoiceSummary } from "@/features/quotes/types/quote.types";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { formatCurrency, formatDate } from "@/shared/lib/formatters";

interface LinkedInvoiceCardProps {
  linkedInvoice: LinkedInvoiceSummary | null;
  timezone?: string | null;
  isConverting: boolean;
  onConvert: () => Promise<void>;
  onOpenInvoice: (invoiceId: string) => void;
  lowEmphasis?: boolean;
}

export function LinkedInvoiceCard({
  linkedInvoice,
  timezone,
  isConverting,
  onConvert,
  onOpenInvoice,
  lowEmphasis = false,
}: LinkedInvoiceCardProps): React.ReactElement | null {
  const sectionClassName = lowEmphasis ? "mt-3 px-4" : "mt-3 px-4";
  const cardClassName = lowEmphasis
    ? "ghost-shadow rounded-lg border border-outline-variant/30 bg-surface-container-low p-4"
    : "ghost-shadow rounded-lg border border-outline-variant/30 bg-surface-container-lowest p-4";
  const convertButtonClassName = "mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-outline px-4 py-3 text-sm font-semibold text-on-surface transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <section className={sectionClassName}>
      <div className={cardClassName}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
              Linked Invoice
            </p>
            <p className="mt-1.5 font-semibold text-on-surface">
              {linkedInvoice ? linkedInvoice.doc_number : "No invoice yet"}
            </p>
            {linkedInvoice ? (
              <p className="mt-1 text-sm text-on-surface-variant">
                {[
                  linkedInvoice.due_date
                    ? `Due ${formatDate(`${linkedInvoice.due_date}T00:00:00.000Z`, timezone)}`
                    : "No due date",
                  formatCurrency(linkedInvoice.total_amount),
                  `Created ${formatDate(linkedInvoice.created_at, timezone)}`,
                ].join(" · ")}
              </p>
            ) : null}
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
          <button
            type="button"
            className={convertButtonClassName}
            onClick={() => {
              void onConvert();
            }}
            disabled={isConverting}
          >
            {isConverting ? "Loading..." : "Convert to Invoice"}
          </button>
        )}
      </div>
    </section>
  );
}
