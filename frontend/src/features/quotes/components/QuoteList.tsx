import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { invoiceService } from "@/features/invoices/services/invoiceService";
import type { InvoiceListItem } from "@/features/invoices/types/invoice.types";
import { useQuoteCreateFlow } from "@/features/quotes/hooks/useQuoteCreateFlow";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteListItem } from "@/features/quotes/types/quote.types";
import { BottomNav } from "@/shared/components/BottomNav";
import { Button } from "@/shared/components/Button";
import { DocumentCardSkeleton } from "@/shared/components/DocumentCardSkeleton";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { Input } from "@/shared/components/Input";
import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { formatDate } from "@/shared/lib/formatters";
import { EmptyState } from "@/ui/EmptyState";
import { Eyebrow } from "@/ui/Eyebrow";
import { QuoteListRow } from "@/ui/QuoteListRow";
import type { StatusPillVariant } from "@/ui/StatusPill";
import { buildInvoiceSubtitle, buildQuoteSubtitle, matchesSearch } from "./QuoteList.helpers";

type DocumentMode = "quotes" | "invoices";
type DocumentStatus = StatusPillVariant;

interface DocumentRow {
  id: string;
  customerLabel: string;
  titleLabel?: string | null;
  docAndDate: string;
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

function DocumentRowsSection({ label, rows, onRowClick }: DocumentRowsSectionProps): React.ReactElement {
  return (
    <section aria-label={label}>
      <div className="mb-2 px-4">
        <Eyebrow>{label}</Eyebrow>
      </div>
      <div className="mx-4 rounded-xl bg-surface-container-low p-3">
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id}>
              <QuoteListRow
                customerLabel={row.customerLabel}
                titleLabel={row.titleLabel}
                docAndDate={row.docAndDate}
                totalAmount={row.totalAmount}
                status={row.status}
                isDraft={row.isDraft}
                needsCustomerAssignment={row.needsCustomerAssignment}
                onClick={() => onRowClick(row)}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function QuoteList(): React.ReactElement {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [documentMode, setDocumentMode] = useState<DocumentMode>("quotes");
  const [quotes, setQuotes] = useState<QuoteListItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
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

  useEffect(() => {
    if (!isSearchOpen) {
      return;
    }
    const inputElement = document.getElementById("document-search");
    if (inputElement instanceof HTMLInputElement) {
      inputElement.focus();
    }
  }, [isSearchOpen]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredQuotes = useMemo(
    () => quotes.filter((quote) => matchesSearch(quote, normalizedSearchQuery)),
    [normalizedSearchQuery, quotes],
  );

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
      customerLabel: quote.customer_name ?? "Unassigned",
      titleLabel: quote.title ?? null,
      docAndDate: [
        quote.doc_number,
        formatDate(quote.created_at, timezone),
      ].join(" · "),
      totalAmount: quote.total_amount,
      status: quote.status,
      destination: `/documents/${quote.id}/edit`,
      destinationState: { origin: "list" },
      isDraft: true,
      needsCustomerAssignment: quote.requires_customer_assignment === true,
    })),
    [draftQuotes, timezone],
  );

  const nonDraftQuoteRows = useMemo<DocumentRow[]>(
    () => nonDraftQuotes.map((quote) => ({
      id: quote.id,
      customerLabel: quote.customer_name ?? "Unassigned",
      titleLabel: quote.title ?? null,
      docAndDate: [
        quote.doc_number,
        formatDate(quote.created_at, timezone),
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
      customerLabel: invoice.customer_name,
      titleLabel: invoice.title ?? null,
      docAndDate: [
        invoice.doc_number,
        formatDate(invoice.created_at, timezone),
      ].join(" · "),
      totalAmount: invoice.total_amount,
      status: invoice.status,
      destination: `/invoices/${invoice.id}`,
    })),
    [filteredInvoices, timezone],
  );
  const quoteCreateFlow = useQuoteCreateFlow({
    timezone,
    onCreateNew: () => navigate("/quotes/capture"),
    onQuoteDuplicated: (quoteId) => navigate(`/documents/${quoteId}/edit`),
  });

  return (
    <main className="min-h-screen bg-background pb-24">
      <ScreenHeader title={headerTitle} subtitle={headerSubtitle} layout="top-level" />
      <section className="mx-auto w-full max-w-3xl pb-2 pt-20">
        <div className="mb-4 px-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div
              aria-label="Document type filter"
              className="inline-flex rounded-full bg-surface-container-low p-1"
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
            {!isSearchOpen ? (
              <Button
                type="button"
                variant="iconButton"
                size="sm"
                aria-label="Open search"
                className="border border-outline-variant/30 bg-surface-container-lowest text-on-surface ghost-shadow"
                onClick={() => setIsSearchOpen(true)}
              >
                <span className="material-symbols-outlined block text-[1.125rem] leading-none">search</span>
              </Button>
            ) : null}
          </div>
          {isSearchOpen ? (
            <div className="relative">
              <Input
                label={searchLabel}
                id="document-search"
                placeholder={searchPlaceholder}
                hideLabel
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pr-14"
              />
              <Button
                type="button"
                variant="iconButton"
                size="xs"
                aria-label="Close search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-outline"
                onClick={() => {
                  setSearchQuery("");
                  setIsSearchOpen(false);
                }}
              >
                <span className="material-symbols-outlined block text-base leading-none">close</span>
              </Button>
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <div
            role="status"
            aria-label={documentMode === "quotes" ? "Loading quotes" : "Loading invoices"}
            className="space-y-3 px-4"
          >
            {Array.from({ length: 4 }).map((_, index) => (
              <DocumentCardSkeleton key={`${documentMode}-skeleton-${index}`} />
            ))}
          </div>
        ) : null}

        {loadError ? (
          <div className="mx-4">
            <FeedbackMessage variant="error">{loadError}</FeedbackMessage>
          </div>
        ) : null}

        {!isLoading && !loadError && filteredRows.length === 0 ? (
          <EmptyState
            className="mx-4 mt-8 p-8"
            icon="description"
            title={emptyStateMessage}
          />
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
        onClick={quoteCreateFlow.openCreateEntry}
      >
        <span className="material-symbols-outlined">description</span>
      </button>
      {quoteCreateFlow.dialogs}
      <BottomNav active="quotes" />
    </main>
  );
}
