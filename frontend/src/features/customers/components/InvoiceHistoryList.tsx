import type { InvoiceListItem } from "@/features/invoices/types/invoice.types";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { SkeletonBlock } from "@/shared/components/SkeletonBlock";
import { formatCurrency, formatDate } from "@/shared/lib/formatters";
import { StatusPill } from "@/ui/StatusPill";

interface InvoiceHistoryListProps {
  invoices: InvoiceListItem[];
  isLoading: boolean;
  loadError: string | null;
  onInvoiceClick: (invoiceId: string) => void;
  timezone?: string | null;
  showHeader?: boolean;
}

export function InvoiceHistoryList({
  invoices,
  isLoading,
  loadError,
  onInvoiceClick,
  timezone,
  showHeader = true,
}: InvoiceHistoryListProps): React.ReactElement {
  const invoiceCountLabel = `${invoices.length} ${invoices.length === 1 ? "INVOICE" : "INVOICES"}`;

  return (
    <section>
      {showHeader ? (
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
            Invoice History
          </p>
          <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
            {invoiceCountLabel}
          </p>
        </div>
      ) : null}

      {isLoading ? (
        <div role="status" aria-label="Loading invoices" className="space-y-3 rounded-xl bg-surface-container-low p-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={`invoice-history-skeleton-${index}`} className="rounded-xl bg-surface-container-lowest p-4 ghost-shadow">
              <div className="flex items-baseline justify-between gap-3">
                <SkeletonBlock width="42%" height="1rem" />
                <SkeletonBlock width="26%" height="1rem" />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <SkeletonBlock width="58%" height="0.875rem" />
                <SkeletonBlock width="24%" height="1.5rem" borderRadius="9999px" />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!isLoading && loadError ? <FeedbackMessage variant="error">{loadError}</FeedbackMessage> : null}

      {!isLoading && !loadError && invoices.length > 0 ? (
        <div className="rounded-xl bg-surface-container-low p-3">
          <ul className="flex flex-col gap-3">
            {invoices.map((invoice) => {
              const primaryLabel = invoice.title ?? invoice.doc_number;
              const supportingDetails = [
                ...(invoice.title ? [invoice.doc_number] : []),
                formatDate(invoice.created_at, timezone),
              ].join(" · ");

              return (
                <li key={invoice.id}>
                  <button
                    type="button"
                    className="w-full cursor-pointer rounded-xl bg-surface-container-lowest p-4 text-left ghost-shadow transition active:scale-[0.98] active:bg-surface-container-low"
                    onClick={() => onInvoiceClick(invoice.id)}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-headline font-bold text-on-surface">{primaryLabel}</p>
                      <p className="font-headline font-bold text-on-surface">
                        {formatCurrency(invoice.total_amount)}
                      </p>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="text-sm text-on-surface-variant">{supportingDetails}</p>
                      <StatusPill variant={invoice.status} />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {!isLoading && !loadError && invoices.length === 0 ? (
        <p className="rounded-lg bg-surface-container-lowest p-4 text-sm text-outline ghost-shadow">
          No invoices yet.
        </p>
      ) : null}
    </section>
  );
}
