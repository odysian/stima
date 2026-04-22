import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteReuseCandidate } from "@/features/quotes/types/quote.types";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { Input } from "@/shared/components/Input";
import { StatusPill } from "@/ui/StatusPill";
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

function buildLoadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Unable to load quotes";
}

function buildDuplicateErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Unable to duplicate quote";
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
    return "No quotes match your search.";
  }
  if (activeTab === "recent") {
    return hasCustomerScope ? "No recent quotes for this customer." : "No recent quotes yet.";
  }
  return hasCustomerScope ? "No quotes found for this customer." : "No quotes available.";
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

    let isActive = true;
    setIsLoading(true);
    setLoadError(null);

    void quoteService.listReuseCandidates({
      customer_id: customerId,
      q: normalizedSearchQuery || undefined,
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
  }, [customerId, normalizedSearchQuery, open]);

  useEffect(() => {
    if (open) {
      return;
    }

    setActiveTab("recent");
    setSearchQuery("");
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
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop fixed inset-0 z-50" />
        <div className="sheet-safe-bottom pointer-events-none fixed inset-0 z-50 flex items-end justify-center px-4 sm:items-center">
          <Dialog.Content className="modal-shadow pointer-events-auto w-full max-w-2xl rounded-[1.75rem] border border-outline-variant/20 bg-surface-container-lowest p-6">
            <Dialog.Title className="font-headline text-xl font-bold tracking-tight text-on-surface">
              Create from existing
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-6 text-on-surface-variant">
              Pick a quote to duplicate into a new draft.
            </Dialog.Description>

            <div className="mt-4">
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
                <div role="status" aria-label="Loading quotes" className="rounded-xl bg-surface-container-low p-4 text-sm text-on-surface-variant">
                  Loading quotes...
                </div>
              ) : null}

              {loadError ? (
                <FeedbackMessage variant="error">{loadError}</FeedbackMessage>
              ) : null}

              {duplicateError ? (
                <FeedbackMessage variant="error">{duplicateError}</FeedbackMessage>
              ) : null}

              {!isLoading && !loadError && visibleCandidates.length === 0 ? (
                <section className="rounded-xl bg-surface-container-low p-4 text-sm text-on-surface-variant">
                  {emptyStateMessage}
                </section>
              ) : null}

              {!isLoading && !loadError ? (
                <ul className="space-y-3">
                  {visibleCandidates.map((candidate) => (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        className="w-full cursor-pointer rounded-xl border border-outline-variant/30 bg-surface-container-low p-4 text-left transition-colors hover:bg-surface-container-lowest disabled:cursor-not-allowed disabled:opacity-70"
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

            <div className="mt-6">
              <button
                type="button"
                className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-lg border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-lowest"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
