import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { DocumentRowsSection, type DocumentRow } from "@/features/quotes/components/DocumentRowsSection";
import { DocumentSelectionFooter } from "@/features/quotes/components/DocumentSelectionFooter";
import { QuoteListControls } from "@/features/quotes/components/QuoteListControls";
import { useReconnectRefresh } from "@/features/quotes/components/useReconnectRefresh";
import { useDocumentBulkActions } from "@/features/quotes/hooks/useDocumentBulkActions";
import { useDocumentSelection } from "@/features/quotes/hooks/useDocumentSelection";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteListItem } from "@/features/quotes/types/quote.types";
import { matchesSearch } from "@/features/quotes/components/QuoteList.helpers";
import { invoiceService } from "@/features/invoices/services/invoiceService";
import type { InvoiceListItem } from "@/features/invoices/types/invoice.types";
import { BottomNav } from "@/shared/components/BottomNav";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { DocumentCardSkeleton } from "@/shared/components/DocumentCardSkeleton";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { formatDate } from "@/shared/lib/formatters";
import { Banner } from "@/ui/Banner";
import { EmptyState } from "@/ui/EmptyState";

type DocumentMode = "quotes" | "invoices";

function buildArchivedSubtitle(params: {
  mode: DocumentMode;
  quotes: QuoteListItem[];
  invoices: InvoiceListItem[];
  isLoadingQuotes: boolean;
  isLoadingInvoices: boolean;
  quoteLoadError: string | null;
  invoiceLoadError: string | null;
}): string {
  if (params.mode === "quotes") {
    if (params.isLoadingQuotes) {
      return "Loading archived quotes...";
    }
    if (params.quoteLoadError) {
      return "Unable to load archived quotes.";
    }
    if (params.quotes.length === 0 && !params.isLoadingQuotes) {
      return "No archived quotes yet.";
    }
    return `${params.quotes.length} archived quote${params.quotes.length === 1 ? "" : "s"}`;
  }

  if (params.isLoadingInvoices) {
    return "Loading archived invoices...";
  }
  if (params.invoiceLoadError) {
    return "Unable to load archived invoices.";
  }
  if (params.invoices.length === 0 && !params.isLoadingInvoices) {
    return "No archived invoices yet.";
  }
  return `${params.invoices.length} archived invoice${params.invoices.length === 1 ? "" : "s"}`;
}

export function ArchiveList(): React.ReactElement {
  const navigate = useNavigate();
  const { authMode, user } = useAuth();
  const [documentMode, setDocumentMode] = useState<DocumentMode>("quotes");
  const [quotes, setQuotes] = useState<QuoteListItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(true);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const [quoteLoadError, setQuoteLoadError] = useState<string | null>(null);
  const [invoiceLoadError, setInvoiceLoadError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const {
    isSelectionMode,
    selectedIds,
    selectedCount,
    enterSelectionMode,
    cancelSelection,
    toggleSelection,
    isSelected,
  } = useDocumentSelection({ activeMode: documentMode });
  const {
    bulkActionError,
    bulkActionFeedback,
    isBulkActionPending,
    showArchiveConfirm,
    showDeleteConfirm,
    openArchiveConfirm,
    openDeleteConfirm,
    closeArchiveConfirm,
    closeDeleteConfirm,
    closeSelectionActionDialogs,
    clearBulkActionFeedback,
    executeBulkAction,
  } = useDocumentBulkActions({
    documentMode,
    selectedIds,
    onComplete: () => {
      cancelSelection();
      setRefreshTick((current) => current + 1);
    },
  });

  const { reconnectTick } = useReconnectRefresh(async () => undefined);

  useEffect(() => {
    let isActive = true;

    async function fetchDocuments(): Promise<void> {
      if (authMode === "signed_out") {
        if (isActive) {
          setQuotes([]);
          setInvoices([]);
          setQuoteLoadError(null);
          setInvoiceLoadError(null);
          setIsLoadingQuotes(false);
          setIsLoadingInvoices(false);
        }
        return;
      }

      if (documentMode === "quotes") {
        setIsLoadingQuotes(true);
        setQuoteLoadError(null);
        try {
          const nextQuotes = await quoteService.listQuotes({ archived: true });
          if (isActive) {
            setQuotes(nextQuotes);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to load archived quotes";
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
        const nextInvoices = await invoiceService.listInvoices({ archived: true });
        if (isActive) {
          setInvoices(nextInvoices);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load archived invoices";
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
  }, [authMode, documentMode, reconnectTick, refreshTick]);

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
  const headerSubtitle = buildArchivedSubtitle({
    mode: documentMode,
    quotes,
    invoices,
    isLoadingQuotes,
    isLoadingInvoices,
    quoteLoadError,
    invoiceLoadError,
  });
  const isLoading = documentMode === "quotes" ? isLoadingQuotes : isLoadingInvoices;
  const loadError = documentMode === "quotes" ? quoteLoadError : invoiceLoadError;
  const filteredRows = documentMode === "quotes" ? filteredQuotes : filteredInvoices;
  const totalRows = documentMode === "quotes" ? quotes.length : invoices.length;

  const quoteRows = useMemo<DocumentRow[]>(
    () => filteredQuotes.map((quote) => ({
      id: quote.id,
      doc_type: "quote",
      customerLabel: quote.customer_name ?? "Unassigned",
      titleLabel: quote.title ?? null,
      docAndDate: [quote.doc_number, formatDate(quote.created_at, timezone)].join(" · "),
      totalAmount: quote.total_amount,
      status: quote.status,
      destination: quote.status === "draft" ? `/documents/${quote.id}/edit` : `/quotes/${quote.id}/preview`,
      destinationState: quote.status === "draft" ? { origin: "list" } : undefined,
      isDraft: quote.status === "draft",
      needsCustomerAssignment: quote.requires_customer_assignment === true,
    })),
    [filteredQuotes, timezone],
  );
  const invoiceRows = useMemo<DocumentRow[]>(
    () => filteredInvoices.map((invoice) => ({
      id: invoice.id,
      doc_type: "invoice",
      customerLabel: invoice.customer_name,
      titleLabel: invoice.title ?? null,
      docAndDate: [invoice.doc_number, formatDate(invoice.created_at, timezone)].join(" · "),
      totalAmount: invoice.total_amount,
      status: invoice.status,
      destination: `/invoices/${invoice.id}`,
    })),
    [filteredInvoices, timezone],
  );

  const rows = documentMode === "quotes" ? quoteRows : invoiceRows;
  const sectionLabel = documentMode === "quotes" ? "ARCHIVED QUOTES" : "ARCHIVED INVOICES";
  const emptyStateTitle = totalRows === 0
    ? "No archived documents yet."
    : `No archived ${documentMode} match your search.`;
  const searchLabel = documentMode === "quotes" ? "Search archived quotes" : "Search archived invoices";
  const searchPlaceholder = documentMode === "quotes"
    ? "Search customer, title, or quote ID..."
    : "Search customer, title, or invoice ID...";

  return (
    <main className="min-h-screen bg-background pb-24">
      <ScreenHeader title="Archived" subtitle={headerSubtitle} onBack={() => navigate("/")} />

      <section className="mx-auto w-full max-w-3xl pb-4 pt-20">
        <QuoteListControls
          documentMode={documentMode}
          isSelectionMode={isSelectionMode}
          isSearchOpen={isSearchOpen}
          searchQuery={searchQuery}
          searchLabel={searchLabel}
          searchPlaceholder={searchPlaceholder}
          onDocumentModeChange={setDocumentMode}
          onSearchToggle={() => {
            if (isSearchOpen) {
              setSearchQuery("");
            }
            setIsSearchOpen((open) => !open);
          }}
          onSearchChange={setSearchQuery}
          onSearchClear={() => setSearchQuery("")}
          onEnterSelectionMode={enterSelectionMode}
        />

        {bulkActionFeedback ? (
          <div className="mb-4 px-4">
            <Banner
              kind={bulkActionFeedback.kind}
              title={bulkActionFeedback.title}
              message={bulkActionFeedback.message}
              onDismiss={clearBulkActionFeedback}
            />
          </div>
        ) : null}

        {bulkActionError ? (
          <div className="mb-4 px-4">
            <FeedbackMessage variant="error">{bulkActionError}</FeedbackMessage>
          </div>
        ) : null}

        {isLoading ? (
          <div
            role="status"
            aria-label={documentMode === "quotes" ? "Loading archived quotes" : "Loading archived invoices"}
            className="space-y-3 px-4"
          >
            {Array.from({ length: 4 }).map((_, index) => (
              <DocumentCardSkeleton key={`${documentMode}-archived-skeleton-${index}`} />
            ))}
          </div>
        ) : null}

        {loadError ? (
          <div className="mx-4">
            <FeedbackMessage variant="error">{loadError}</FeedbackMessage>
          </div>
        ) : null}

        {!isLoading && !loadError && filteredRows.length === 0 ? (
          <EmptyState className="mx-4 mt-8 p-8" icon="inventory_2" title={emptyStateTitle} />
        ) : null}

        {!isLoading && !loadError && filteredRows.length > 0 ? (
          <DocumentRowsSection
            label={sectionLabel}
            rows={rows}
            isSelectionMode={isSelectionMode}
            isSelected={(row) => isSelected(row.id)}
            onRowClick={(row) => {
              if (isSelectionMode) {
                toggleSelection(row.id);
                return;
              }
              navigate(row.destination, row.destinationState ? { state: row.destinationState } : undefined);
            }}
          />
        ) : null}
      </section>

      {isSelectionMode ? (
        <DocumentSelectionFooter
          selectedCount={selectedCount}
          archiveLabel="Unarchive"
          onCancelSelection={() => {
            closeSelectionActionDialogs();
            cancelSelection();
          }}
          onArchiveSelection={openArchiveConfirm}
          onDeleteSelectionPermanently={openDeleteConfirm}
        />
      ) : null}

      {showArchiveConfirm ? (
        <ConfirmModal
          title={`Unarchive ${selectedCount} selected ${selectedCount === 1 ? "document" : "documents"}?`}
          body="Unarchived documents return to active lists."
          confirmLabel="Unarchive"
          cancelLabel="Keep selected"
          confirmDisabled={isBulkActionPending || selectedCount === 0}
          onCancel={closeArchiveConfirm}
          onConfirm={() => {
            void executeBulkAction("unarchive");
          }}
        />
      ) : null}

      {showDeleteConfirm ? (
        <ConfirmModal
          title={`Delete ${selectedCount} selected ${selectedCount === 1 ? "document" : "documents"} permanently?`}
          body="This action cannot be undone. Documents blocked by policy will stay untouched."
          confirmLabel="Delete permanently"
          cancelLabel="Keep selected"
          variant="destructive"
          confirmDisabled={isBulkActionPending || selectedCount === 0}
          onCancel={closeDeleteConfirm}
          onConfirm={() => {
            void executeBulkAction("delete");
          }}
        />
      ) : null}

      <BottomNav active="quotes" />
    </main>
  );
}
