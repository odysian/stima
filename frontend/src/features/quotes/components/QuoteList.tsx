import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { DocumentRowsSection, type DocumentRow } from "@/features/quotes/components/DocumentRowsSection";
import { invoiceService } from "@/features/invoices/services/invoiceService";
import type { InvoiceListItem } from "@/features/invoices/types/invoice.types";
import { PendingCaptureDeleteDialog } from "@/features/quotes/components/PendingCaptureDeleteDialog";
import { PendingCapturesSection } from "@/features/quotes/components/PendingCapturesSection";
import { useReconnectRefresh } from "@/features/quotes/components/useReconnectRefresh";
import { useOutboxSuccessQuoteRefresh } from "@/features/quotes/components/useOutboxSuccessQuoteRefresh";
import { useQuoteCreateFlow } from "@/features/quotes/hooks/useQuoteCreateFlow";
import { getStorageErrorMessage } from "@/features/quotes/offline/captureDb";
import type { LocalCaptureSummary } from "@/features/quotes/offline/captureTypes";
import { useRecoverableCaptures } from "@/features/quotes/offline/useRecoverableCaptures";
import { runOutboxPass } from "@/features/quotes/offline/outboxEngine";
import { getJobForSession, updateJobStatus } from "@/features/quotes/offline/outboxRepository";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteListItem } from "@/features/quotes/types/quote.types";
import { BottomNav } from "@/shared/components/BottomNav";
import { DocumentCardSkeleton } from "@/shared/components/DocumentCardSkeleton";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { formatDate } from "@/shared/lib/formatters";
import { Banner } from "@/ui/Banner";
import { EmptyState } from "@/ui/EmptyState";
import { AppIcon } from "@/ui/Icon";
import { DocumentSelectionFooter } from "./DocumentSelectionFooter";
import { QuoteListControls } from "./QuoteListControls";
import { buildInvoiceSubtitle, buildPendingCaptureError, buildQuoteSubtitle, matchesSearch } from "./QuoteList.helpers";
import { useDocumentSelection } from "../hooks/useDocumentSelection";
type DocumentMode = "quotes" | "invoices";

export function QuoteList(): React.ReactElement {
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
  const [pendingCaptureActionError, setPendingCaptureActionError] = useState<string | null>(null);
  const [capturePendingDelete, setCapturePendingDelete] = useState<LocalCaptureSummary | null>(null);
  const {
    isSelectionMode,
    selectedCount,
    enterSelectionMode,
    cancelSelection,
    toggleSelection,
    isSelected,
  } = useDocumentSelection({ activeMode: documentMode });
  const {
    captures: recoverableCaptures,
    isLoading: isLoadingRecoverableCaptures,
    error: recoverableCapturesError,
    refresh: refreshRecoverableCaptures,
    deleteCapture,
  } = useRecoverableCaptures(user?.id);
  const { isOnline, reconnectTick } = useReconnectRefresh(refreshRecoverableCaptures);
  useOutboxSuccessQuoteRefresh({
    userId: user?.id,
    onQuotesLoaded: setQuotes,
    onLoadError: setQuoteLoadError,
  });
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
  }, [authMode, documentMode, reconnectTick]);

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
  const searchPlaceholder = documentMode === "quotes" ? "Search customer, title, or quote ID..." : "Search customer, title, or invoice ID...";
  const emptyStateMessage = totalRows === 0
    ? documentMode === "quotes"
      ? "No quotes yet. Tap New Quote to create your first."
      : "No invoices yet. Convert a quote to an invoice from Preview."
    : `No ${documentMode} match your search.`;
  const draftQuoteRows = useMemo<DocumentRow[]>(
    () => draftQuotes.map((quote) => ({
      id: quote.id,
      doc_type: "quote",
      customerLabel: quote.customer_name ?? "Unassigned",
      titleLabel: quote.title ?? null,
      docAndDate: [quote.doc_number, formatDate(quote.created_at, timezone)].join(" · "),
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
      doc_type: "quote",
      customerLabel: quote.customer_name ?? "Unassigned",
      titleLabel: quote.title ?? null,
      docAndDate: [quote.doc_number, formatDate(quote.created_at, timezone)].join(" · "),
      totalAmount: quote.total_amount,
      status: quote.status,
      destination: `/quotes/${quote.id}/preview`,
    })),
    [nonDraftQuotes, timezone],
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
  const quoteCreateFlow = useQuoteCreateFlow({
    timezone,
    onCreateNew: () => navigate("/quotes/capture"),
    onQuoteDuplicated: (quoteId) => navigate(`/documents/${quoteId}/edit`),
  });
  const pendingCaptureError = buildPendingCaptureError({
    authMode,
    recoverableCapturesError,
    pendingCaptureActionError,
  });
  function navigateToLocalCapture(sessionId: string, options?: { autoExtract?: boolean }): void {
    const nextSearchParams = new URLSearchParams({ localSession: sessionId });
    if (options?.autoExtract) {
      nextSearchParams.set("autoExtract", "1");
    }
    navigate(`/quotes/capture?${nextSearchParams.toString()}`);
  }

  async function onDeleteCapture(sessionId: string): Promise<void> {
    setPendingCaptureActionError(null);
    try {
      await deleteCapture(sessionId);
    } catch (deleteError) {
      const message = getStorageErrorMessage(deleteError, "Unable to delete pending capture.");
      setPendingCaptureActionError(message);
    }
  }

  async function onRetryCapture(sessionId: string): Promise<void> {
    if (!user?.id) {
      return;
    }

    setPendingCaptureActionError(null);
    try {
      const outboxJob = await getJobForSession(sessionId);
      if (!outboxJob || outboxJob.status === "running") {
        return;
      }

      await updateJobStatus(outboxJob.jobId, {
        status: "queued",
        nextRetryAt: null,
      });
      await runOutboxPass(user.id);
      await refreshRecoverableCaptures();
    } catch (retryError) {
      const message = getStorageErrorMessage(retryError, "Unable to retry pending capture.");
      setPendingCaptureActionError(message);
    }
  }

  return (
    <main className="min-h-screen bg-background pb-24">
      <ScreenHeader title={headerTitle} subtitle={headerSubtitle} layout="top-level" />
      <section className="mx-auto w-full max-w-3xl pb-2 pt-20">
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

        {documentMode === "quotes" ? (
          <>
            {authMode === "offline_recovered" ? (
              <div className="mb-4 px-4">
                <Banner kind="warn" title="Offline mode" message="Showing locally saved pending captures. Reconnect to verify your account and resume sync." />
              </div>
            ) : null}
            <PendingCapturesSection
              captures={recoverableCaptures}
              isLoading={isLoadingRecoverableCaptures}
              isOnline={isOnline}
              timezone={timezone}
              error={pendingCaptureError}
              onResume={(sessionId) => navigateToLocalCapture(sessionId)}
              onExtract={(sessionId) => navigateToLocalCapture(sessionId, { autoExtract: true })}
              onRetry={(sessionId) => { void onRetryCapture(sessionId); }}
              onDelete={(sessionId) => {
                const capture = recoverableCaptures.find((item) => item.sessionId === sessionId) ?? null;
                setCapturePendingDelete(capture);
              }}
            />
          </>
        ) : null}

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
                    isSelectionMode={isSelectionMode}
                    isSelected={(row) => isSelected(row.id)}
                    onRowClick={(row) => {
                      if (isSelectionMode) {
                        toggleSelection(row.id);
                        return;
                      }
                      navigate(row.destination, { state: row.destinationState });
                    }}
                  />
                ) : null}
                {nonDraftQuoteRows.length > 0 ? (
                  <div className={draftQuoteRows.length > 0 ? "mt-2" : undefined}>
                    <DocumentRowsSection
                      label="PAST QUOTES"
                      rows={nonDraftQuoteRows}
                      isSelectionMode={isSelectionMode}
                      isSelected={(row) => isSelected(row.id)}
                      onRowClick={(row) => {
                        if (isSelectionMode) {
                          toggleSelection(row.id);
                          return;
                        }
                        navigate(row.destination);
                      }}
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <DocumentRowsSection
                label="PAST INVOICES"
                rows={invoiceRows}
                isSelectionMode={isSelectionMode}
                isSelected={(row) => isSelected(row.id)}
                onRowClick={(row) => {
                  if (isSelectionMode) {
                    toggleSelection(row.id);
                    return;
                  }
                  navigate(row.destination);
                }}
              />
            )}
          </>
        ) : null}
      </section>

      {!isSelectionMode ? (
        <button
          type="button"
          aria-label="New quote"
          className="fixed bottom-20 right-4 z-50 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full forest-gradient text-on-primary ghost-shadow transition-all active:scale-95"
          onClick={quoteCreateFlow.openCreateEntry}
        >
          <AppIcon name="description" />
        </button>
      ) : null}
      {isSelectionMode ? (
        <DocumentSelectionFooter
          selectedCount={selectedCount}
          onCancelSelection={cancelSelection}
        />
      ) : null}
      <PendingCaptureDeleteDialog
        capture={capturePendingDelete}
        onCancel={() => setCapturePendingDelete(null)}
        onConfirm={(sessionId) => {
          setCapturePendingDelete(null);
          void onDeleteCapture(sessionId);
        }}
      />
      {quoteCreateFlow.dialogs}
      <BottomNav active="quotes" />
    </main>
  );
}
