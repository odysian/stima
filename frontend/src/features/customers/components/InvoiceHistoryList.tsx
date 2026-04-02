import type { InvoiceListItem } from "@/features/invoices/types/invoice.types";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { formatCurrency, formatDate } from "@/shared/lib/formatters";

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
        <p role="status" className="rounded-lg bg-surface-container-lowest p-4 text-sm text-outline ghost-shadow">
          Loading invoices...
        </p>
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
                      <StatusBadge variant={invoice.status} />
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
