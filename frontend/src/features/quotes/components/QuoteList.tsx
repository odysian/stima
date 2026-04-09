import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { invoiceService } from "@/features/invoices/services/invoiceService";
import type { InvoiceListItem } from "@/features/invoices/types/invoice.types";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteListItem } from "@/features/quotes/types/quote.types";
import { BottomNav } from "@/shared/components/BottomNav";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { Input } from "@/shared/components/Input";
import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { StatusBadge, statusBadgeBaseClasses } from "@/shared/components/StatusBadge";
import { formatCurrency, formatDate } from "@/shared/lib/formatters";

type DocumentMode = "quotes" | "invoices";
type DocumentStatus = QuoteListItem["status"] | InvoiceListItem["status"];

interface DocumentRow {
  id: string;
  primaryLabel: string;
  supportingDetails: string;
  totalAmount: number | null;
  status: DocumentStatus;
  destination: string;
  destinationState?: {
    origin: "list";
  };
  isDraft?: boolean;
  needsCustomerAssignment?: boolean;
}

interface DocumentRowsSectionProps {
  label: string;
  rows: DocumentRow[];
  onRowClick: (row: DocumentRow) => void;
}

const baseRowClasses = "w-full cursor-pointer rounded-xl bg-surface-container-lowest p-4 text-left ghost-shadow transition active:scale-[0.98] active:bg-surface-container-low";
const draftRowClasses = "glass-surface w-full cursor-pointer rounded-xl border-l-4 border-warning-accent p-4 text-left backdrop-blur-md ghost-shadow transition active:scale-[0.98] active:bg-surface-container-low";
const needsCustomerBadgeClasses = `${statusBadgeBaseClasses} bg-warning-container text-warning`;

function DocumentRowsSection({ label, rows, onRowClick }: DocumentRowsSectionProps): React.ReactElement {
  return (
    <section aria-label={label}>
      <div className="mb-2 px-4">
        <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
          {label}
        </p>
      </div>
      <div className="mx-4 rounded-xl bg-surface-container-low p-3">
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onRowClick(row)}
                className={row.isDraft ? draftRowClasses : baseRowClasses}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-headline font-bold text-on-surface">
                    {row.primaryLabel}
                  </p>
                  <p className="font-headline font-bold text-on-surface">
                    {formatCurrency(row.totalAmount)}
                  </p>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="text-sm text-on-surface-variant">
                    {row.supportingDetails}
                  </p>
                  {row.needsCustomerAssignment ? (
                    <span className={needsCustomerBadgeClasses}>Needs customer</span>
                  ) : (
                    <StatusBadge variant={row.status} />
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function matchesSearch(
  item: Pick<QuoteListItem, "customer_name" | "doc_number" | "title">,
  normalizedSearchQuery: string,
): boolean {
  if (!normalizedSearchQuery) {
    return true;
  }

  return (
    (item.customer_name ?? "").toLowerCase().includes(normalizedSearchQuery)
    || item.doc_number.toLowerCase().includes(normalizedSearchQuery)
    || (item.title?.toLowerCase() ?? "").includes(normalizedSearchQuery)
  );
}

function buildQuoteSubtitle(quotes: QuoteListItem[], isLoading: boolean, loadError: string | null): string | undefined {
  if (isLoading || loadError) {
    return undefined;
  }

  const activeQuoteCount = quotes.filter((quote) => quote.status === "ready" || quote.status === "shared").length;
  const pendingReviewCount = quotes.filter((quote) => quote.status === "draft").length;
  return `${activeQuoteCount} active · ${pendingReviewCount} pending`;
}

function buildInvoiceSubtitle(
  invoices: InvoiceListItem[],
  isLoading: boolean,
  loadError: string | null,
): string | undefined {
  if (isLoading || loadError) {
    return undefined;
  }

  const activeInvoiceCount = invoices.filter((invoice) => invoice.status === "ready" || invoice.status === "sent").length;
  const pendingInvoiceCount = invoices.filter((invoice) => invoice.status === "draft").length;
  return `${activeInvoiceCount} active · ${pendingInvoiceCount} pending`;
}

export function QuoteList(): React.ReactElement {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [documentMode, setDocumentMode] = useState<DocumentMode>("quotes");
  const [quotes, setQuotes] = useState<QuoteListItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(true);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const [quoteLoadError, setQuoteLoadError] = useState<string | null>(null);
  const [invoiceLoadError, setInvoiceLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function fetchDocuments(): Promise<void> {
      if (documentMode === "quotes") {
        setIsLoadingQuotes(true);
        setQuoteLoadError(null);
        try {
          const nextQuotes = await quoteService.listQuotes();
          if (isActive) {
            setQuotes(nextQuotes);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to load quotes";
          if (isActive) {
            setQuoteLoadError(message);
          }
        } finally {
          if (isActive) {
            setIsLoadingQuotes(false);
          }
        }
        return;
      }

      setIsLoadingInvoices(true);
      setInvoiceLoadError(null);
      try {
        const nextInvoices = await invoiceService.listInvoices();
        if (isActive) {
          setInvoices(nextInvoices);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load invoices";
        if (isActive) {
          setInvoiceLoadError(message);
        }
      } finally {
        if (isActive) {
          setIsLoadingInvoices(false);
        }
      }
    }

    void fetchDocuments();

    return () => {
      isActive = false;
    };
  }, [documentMode]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredQuotes = useMemo(() => {
    return quotes.filter((quote) => matchesSearch(quote, normalizedSearchQuery));
  }, [normalizedSearchQuery, quotes]);

  const filteredInvoices = useMemo(
    () => invoices.filter((invoice) => matchesSearch(invoice, normalizedSearchQuery)),
    [invoices, normalizedSearchQuery],
  );

  const timezone = user?.timezone ?? null;
  const quoteSubtitle = useMemo(
    () => buildQuoteSubtitle(quotes, isLoadingQuotes, quoteLoadError),
    [isLoadingQuotes, quoteLoadError, quotes],
  );
  const invoiceSubtitle = useMemo(
    () => buildInvoiceSubtitle(invoices, isLoadingInvoices, invoiceLoadError),
    [invoiceLoadError, invoices, isLoadingInvoices],
  );
  const isLoading = documentMode === "quotes" ? isLoadingQuotes : isLoadingInvoices;
  const loadError = documentMode === "quotes" ? quoteLoadError : invoiceLoadError;
  const filteredRows = documentMode === "quotes" ? filteredQuotes : filteredInvoices;
  const draftQuotes = useMemo(
    () => filteredQuotes.filter((quote) => quote.status === "draft"),
    [filteredQuotes],
  );
  const nonDraftQuotes = useMemo(
    () => filteredQuotes.filter((quote) => quote.status !== "draft"),
    [filteredQuotes],
  );
  const totalRows = documentMode === "quotes" ? quotes.length : invoices.length;
  const headerTitle = documentMode === "quotes" ? "Quotes" : "Invoices";
  const headerSubtitle = documentMode === "quotes" ? quoteSubtitle : invoiceSubtitle;
  const searchLabel = documentMode === "quotes" ? "Search quotes" : "Search invoices";
  const searchPlaceholder = documentMode === "quotes"
    ? "Search customer, title, or quote ID..."
    : "Search customer, title, or invoice ID...";
  const emptyStateMessage = totalRows === 0
    ? documentMode === "quotes"
      ? "No quotes yet. Tap New Quote to create your first."
      : "No invoices yet. Convert a quote to an invoice from Preview."
    : `No ${documentMode} match your search.`;
  const draftQuoteRows = useMemo<DocumentRow[]>(
    () => draftQuotes.map((quote) => ({
      id: quote.id,
      primaryLabel: quote.customer_name ?? "Unassigned",
      supportingDetails: [
        quote.doc_number,
        formatDate(quote.created_at, timezone),
        `${quote.item_count} ${quote.item_count === 1 ? "item" : "items"}`,
      ].join(" · "),
      totalAmount: quote.total_amount,
      status: quote.status,
      destination: `/quotes/${quote.id}/review`,
      destinationState: { origin: "list" },
      isDraft: true,
      needsCustomerAssignment: quote.requires_customer_assignment === true,
    })),
    [draftQuotes, timezone],
  );

  const nonDraftQuoteRows = useMemo<DocumentRow[]>(
    () => nonDraftQuotes.map((quote) => ({
      id: quote.id,
      primaryLabel: quote.title ?? quote.doc_number,
      supportingDetails: [
        quote.customer_name ?? "Unassigned customer",
        ...(quote.title ? [quote.doc_number] : []),
        formatDate(quote.created_at, timezone),
        `${quote.item_count} ${quote.item_count === 1 ? "item" : "items"}`,
      ].join(" · "),
      totalAmount: quote.total_amount,
      status: quote.status,
      destination: `/quotes/${quote.id}/preview`,
    })),
    [nonDraftQuotes, timezone],
  );

  const invoiceRows = useMemo<DocumentRow[]>(
    () => filteredInvoices.map((invoice) => ({
      id: invoice.id,
      primaryLabel: invoice.title ?? invoice.doc_number,
      supportingDetails: [
        invoice.customer_name,
        ...(invoice.title ? [invoice.doc_number] : []),
        formatDate(invoice.created_at, timezone),
      ].join(" · "),
      totalAmount: invoice.total_amount,
      status: invoice.status,
      destination: `/invoices/${invoice.id}`,
    })),
    [filteredInvoices, timezone],
  );

  return (
    <main className="min-h-screen bg-background pb-24">
      <ScreenHeader title={headerTitle} subtitle={headerSubtitle} layout="top-level" />
      <section className="mx-auto w-full max-w-3xl pb-2 pt-20">
        <div className="mb-4 px-4">
          <div
            aria-label="Document type filter"
            className="mb-4 inline-flex rounded-full bg-surface-container-low p-1"
          >
            <button
              type="button"
              aria-pressed={documentMode === "quotes"}
              className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition ${
                documentMode === "quotes"
                  ? "ghost-shadow bg-surface-container-lowest text-primary"
                  : "text-on-surface-variant"
              }`}
              onClick={() => setDocumentMode("quotes")}
            >
              Quotes
            </button>
            <button
              type="button"
              aria-pressed={documentMode === "invoices"}
              className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition ${
                documentMode === "invoices"
                  ? "ghost-shadow bg-surface-container-lowest text-primary"
                  : "text-on-surface-variant"
              }`}
              onClick={() => setDocumentMode("invoices")}
            >
              Invoices
            </button>
          </div>
          <Input
            label={searchLabel}
            id="document-search"
            placeholder={searchPlaceholder}
            hideLabel
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>

        {isLoading ? (
          <p role="status" className="px-4 text-sm text-on-surface-variant">
            {documentMode === "quotes" ? "Loading quotes..." : "Loading invoices..."}
          </p>
        ) : null}

        {loadError ? (
          <div className="mx-4">
            <FeedbackMessage variant="error">{loadError}</FeedbackMessage>
          </div>
        ) : null}

        {!isLoading && !loadError && filteredRows.length === 0 ? (
          <section className="mx-4 mt-8 flex flex-col items-center rounded-lg bg-surface-container-lowest p-8 text-center ghost-shadow">
            <span className="material-symbols-outlined mb-2 text-3xl text-outline">description</span>
            <p className="text-sm text-outline">{emptyStateMessage}</p>
          </section>
        ) : null}

        {!isLoading && !loadError && filteredRows.length > 0 ? (
          <>
            {documentMode === "quotes" ? (
              <>
                {draftQuoteRows.length > 0 ? (
                  <DocumentRowsSection
                    label="DRAFTS"
                    rows={draftQuoteRows}
                    onRowClick={(row) => navigate(row.destination, { state: row.destinationState })}
                  />
                ) : null}
                {nonDraftQuoteRows.length > 0 ? (
                  <div className={draftQuoteRows.length > 0 ? "mt-2" : undefined}>
                    <DocumentRowsSection
                      label="PAST QUOTES"
                      rows={nonDraftQuoteRows}
                      onRowClick={(row) => navigate(row.destination)}
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <DocumentRowsSection
                label="PAST INVOICES"
                rows={invoiceRows}
                onRowClick={(row) => navigate(row.destination)}
              />
            )}
          </>
        ) : null}
      </section>

      <button
        type="button"
        aria-label="New quote"
        className="fixed bottom-20 right-4 z-50 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full forest-gradient text-on-primary ghost-shadow transition-all active:scale-95"
        onClick={() => navigate("/quotes/capture")}
      >
        <span className="material-symbols-outlined">description</span>
      </button>
      <BottomNav active="quotes" />
    </main>
  );
}
