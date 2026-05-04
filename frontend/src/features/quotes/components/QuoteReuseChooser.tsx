import { useEffect, useMemo, useState } from "react";

import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteReuseCandidate } from "@/features/quotes/types/quote.types";
import { Button } from "@/shared/components/Button";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { Input } from "@/shared/components/Input";
import { EmptyState } from "@/ui/EmptyState";
import { StatusPill } from "@/ui/StatusPill";
import { Sheet, SheetBody, SheetCloseButton, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/ui/Sheet";
import { formatCurrency, formatDate } from "@/shared/lib/formatters";

interface QuoteReuseChooserProps {
  open: boolean;
  customerId?: string;
  timezone?: string | null;
  onClose: () => void;
  onQuoteDuplicated: (quoteId: string) => void;
}

type ChooserTab = "recent" | "all";

const RECENT_LIMIT = 6;
// Trailing debounce keeps search responsive while reducing network chatter.
const SEARCH_DEBOUNCE_MS = 275;

function buildLoadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Could not load quotes. Try again.";
}

function buildDuplicateErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Could not duplicate this quote. Try again.";
}

function resolveVisibleCandidates(candidates: QuoteReuseCandidate[], activeTab: ChooserTab): QuoteReuseCandidate[] {
  if (activeTab === "recent") {
    return candidates.slice(0, RECENT_LIMIT);
  }
  return candidates;
}

function buildEmptyStateMessage(
  normalizedSearchQuery: string,
  activeTab: ChooserTab,
  hasCustomerScope: boolean,
): string {
  if (normalizedSearchQuery) {
    return "No matches yet. Change or clear your search to see more quotes.";
  }
  if (activeTab === "recent") {
    return hasCustomerScope
      ? "No recent quotes for this customer yet. Try All Quotes or create a new quote."
      : "No recent quotes yet. Try All Quotes or create a new quote.";
  }
  return hasCustomerScope
    ? "No quotes found for this customer. Clear the customer filter or create a new quote."
    : "No quotes available yet. Create a new quote to get started.";
}

export function QuoteReuseChooser({
  open,
  customerId,
  timezone,
  onClose,
  onQuoteDuplicated,
}: QuoteReuseChooserProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<ChooserTab>("recent");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [candidates, setCandidates] = useState<QuoteReuseCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const normalizedSearchQuery = searchQuery.trim();
  const visibleCandidates = useMemo(
    () => resolveVisibleCandidates(candidates, activeTab),
    [activeTab, candidates],
  );
  const emptyStateMessage = buildEmptyStateMessage(
    normalizedSearchQuery,
    activeTab,
    Boolean(customerId),
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    if (normalizedSearchQuery === debouncedSearchQuery) {
      return;
    }

    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(normalizedSearchQuery);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [debouncedSearchQuery, normalizedSearchQuery, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let isActive = true;
    setIsLoading(true);
    setLoadError(null);

    void quoteService.listReuseCandidates({
      customer_id: customerId,
      q: debouncedSearchQuery || undefined,
    })
      .then((nextCandidates) => {
        if (isActive) {
          setCandidates(nextCandidates);
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setCandidates([]);
          setLoadError(buildLoadErrorMessage(error));
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [customerId, debouncedSearchQuery, open]);

  useEffect(() => {
    if (open) {
      return;
    }

    setActiveTab("recent");
    setSearchQuery("");
    setDebouncedSearchQuery("");
    setCandidates([]);
    setIsLoading(false);
    setLoadError(null);
    setDuplicateError(null);
    setDuplicatingId(null);
  }, [open]);

  async function onCandidateSelect(candidateId: string): Promise<void> {
    setDuplicateError(null);
    setDuplicatingId(candidateId);

    try {
      const duplicate = await quoteService.duplicateQuote(candidateId);
      onQuoteDuplicated(duplicate.id);
    } catch (error) {
      setDuplicateError(buildDuplicateErrorMessage(error));
    } finally {
      setDuplicatingId(null);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}
      size="lg"
      contentProps={{ className: "bg-surface-container-lowest" }}
    >
      <SheetHeader>
        <div>
          <SheetTitle>Duplicate an existing quote</SheetTitle>
          <SheetDescription>Choose a quote to copy into a new editable draft.</SheetDescription>
        </div>
        <SheetCloseButton />
      </SheetHeader>

      <SheetBody>
        <div>
              <Input
                label="Search existing quotes"
                id="quote-reuse-search"
                hideLabel
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search customer, title, or quote ID..."
              />
            </div>

            <div className="mt-4 inline-flex rounded-full bg-surface-container-low p-1">
              <button
                type="button"
                aria-pressed={activeTab === "recent"}
                className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeTab === "recent"
                    ? "ghost-shadow bg-surface-container-lowest text-primary"
                    : "text-on-surface-variant"
                }`}
                onClick={() => setActiveTab("recent")}
              >
                Recent
              </button>
              <button
                type="button"
                aria-pressed={activeTab === "all"}
                className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeTab === "all"
                    ? "ghost-shadow bg-surface-container-lowest text-primary"
                    : "text-on-surface-variant"
                }`}
                onClick={() => setActiveTab("all")}
              >
                All Quotes
              </button>
            </div>

            <div className="mt-4 max-h-[52vh] space-y-3 overflow-y-auto pr-1">
              {isLoading ? (
                <div role="status" aria-label="Loading quotes" className="rounded-[var(--radius-document)] bg-surface-container-low p-4 text-sm text-on-surface-variant">
                  Loading quotes to duplicate...
                </div>
              ) : null}

              {loadError ? (
                <FeedbackMessage variant="error">{loadError}</FeedbackMessage>
              ) : null}

              {duplicateError ? (
                <FeedbackMessage variant="error">{duplicateError}</FeedbackMessage>
              ) : null}

              {!isLoading && !loadError && visibleCandidates.length === 0 ? (
                <EmptyState
                  icon="search"
                  title="No quotes found"
                  body={emptyStateMessage}
                />
              ) : null}

              {!isLoading && !loadError ? (
                <ul className="space-y-3">
                  {visibleCandidates.map((candidate) => (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        className="w-full cursor-pointer rounded-[var(--radius-document)] border border-outline-variant/30 bg-surface-container-low p-4 text-left transition-colors hover:bg-surface-container-lowest disabled:cursor-not-allowed disabled:opacity-70"
                        disabled={duplicatingId !== null}
                        onClick={() => { void onCandidateSelect(candidate.id); }}
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="font-headline font-bold text-on-surface">
                            {candidate.customer_name ?? "Unassigned"}
                          </p>
                          <p className="font-headline font-bold text-on-surface">
                            {formatCurrency(candidate.total_amount)}
                          </p>
                        </div>

                        {candidate.title ? (
                          <p className="mt-1 text-sm text-on-surface-variant">{candidate.title}</p>
                        ) : null}

                        <div className="mt-2 flex items-center gap-3">
                          <p className="text-sm text-on-surface-variant">
                            {candidate.doc_number}
                            {" · "}
                            {formatDate(candidate.created_at, timezone ?? null)}
                          </p>
                          <span className="ml-auto">
                            <StatusPill variant={candidate.status} />
                          </span>
                        </div>

                        {candidate.line_item_previews.length > 0 ? (
                          <ul className="mt-3 space-y-1">
                            {candidate.line_item_previews.map((lineItem, index) => (
                              <li key={`${candidate.id}-preview-${index}`} className="flex items-center justify-between gap-3 text-sm text-on-surface-variant">
                                <span className="truncate">{lineItem.description}</span>
                                <span className="shrink-0">{formatCurrency(lineItem.price)}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-3 text-sm text-on-surface-variant">No line items</p>
                        )}

                        {candidate.more_line_item_count > 0 ? (
                          <p className="mt-1 text-sm font-semibold text-on-surface-variant">
                            +{candidate.more_line_item_count} more items
                          </p>
                        ) : null}

                        {duplicatingId === candidate.id ? (
                          <p className="mt-2 text-sm font-semibold text-primary">Duplicating...</p>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
        </div>
      </SheetBody>

      <SheetFooter>
        <Button
          type="button"
          variant="secondary"
          size="md"
          className="w-full"
          onClick={onClose}
        >
          Close
        </Button>
      </SheetFooter>
    </Sheet>
  );
}
