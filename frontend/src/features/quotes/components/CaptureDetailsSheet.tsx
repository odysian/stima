import * as Dialog from "@radix-ui/react-dialog";

import type { ExtractionReviewHiddenDetails, HiddenItemState } from "@/features/quotes/types/quote.types";

interface CaptureDetailsSheetProps {
  open: boolean;
  onClose: () => void;
  transcript: string;
  hiddenDetails?: ExtractionReviewHiddenDetails;
  hiddenDetailState?: Record<string, HiddenItemState>;
  onReviewHiddenItem?: (itemId: string) => Promise<void> | void;
  onDismissHiddenItem?: (itemId: string) => Promise<void> | void;
  isMutating?: boolean;
}

interface ResolvedHiddenItem {
  id: string;
  kind: "append_suggestion" | "unresolved_segment" | "confidence_note";
  field: "notes" | "explicit_total" | "deposit_amount" | "tax_rate" | "discount" | null;
  reason: string | null;
  text: string;
}

function formatPricingField(
  pricingField: "explicit_total" | "deposit_amount" | "tax_rate" | "discount" | null | undefined,
): string | null {
  if (!pricingField) {
    return null;
  }

  if (pricingField === "explicit_total") {
    return "total";
  }
  if (pricingField === "deposit_amount") {
    return "deposit";
  }
  if (pricingField === "tax_rate") {
    return "tax";
  }
  return "discount";
}

function renderEmptySection(message: string): React.ReactElement {
  return (
    <p className="rounded-lg border border-outline-variant/30 bg-surface-container-high p-3 text-sm text-on-surface-variant">
      {message}
    </p>
  );
}

function resolveHiddenItems(hiddenDetails?: ExtractionReviewHiddenDetails): ResolvedHiddenItem[] {
  if (!hiddenDetails) {
    return [];
  }
  if (Array.isArray(hiddenDetails.items) && hiddenDetails.items.length > 0) {
    return hiddenDetails.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      field: item.field ?? null,
      reason: item.reason ?? null,
      text: item.text,
    }));
  }

  const fromSuggestions: ResolvedHiddenItem[] = hiddenDetails.append_suggestions.map((suggestion) => ({
    id: suggestion.id,
    kind: "append_suggestion",
    field: suggestion.pricing_field ?? "notes",
    reason: suggestion.source,
    text: suggestion.raw_text,
  }));
  const fromUnresolved: ResolvedHiddenItem[] = hiddenDetails.unresolved_segments.map((segment) => ({
    id: segment.id,
    kind: "unresolved_segment",
    field: null,
    reason: segment.source,
    text: segment.raw_text,
  }));
  const fromConfidence: ResolvedHiddenItem[] = hiddenDetails.confidence_notes.map((note, index) => ({
    id: `legacy-confidence-${index}`,
    kind: "confidence_note",
    field: null,
    reason: "legacy_confidence_note",
    text: note,
  }));
  return [...fromSuggestions, ...fromUnresolved, ...fromConfidence];
}

export function CaptureDetailsSheet({
  open,
  onClose,
  transcript,
  hiddenDetails,
  hiddenDetailState,
  onReviewHiddenItem,
  onDismissHiddenItem,
  isMutating = false,
}: CaptureDetailsSheetProps): React.ReactElement {
  const hiddenItems = resolveHiddenItems(hiddenDetails);
  const visibleAppendSuggestions = hiddenItems.filter(
    (item) => item.kind === "append_suggestion" && !hiddenDetailState?.[item.id]?.dismissed,
  );
  const visibleUnresolvedSegments = hiddenItems.filter(
    (item) => item.kind === "unresolved_segment" && !hiddenDetailState?.[item.id]?.dismissed,
  );
  const visibleConfidenceNotes = hiddenItems.filter(
    (item) => item.kind === "confidence_note" && !hiddenDetailState?.[item.id]?.dismissed,
  );

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay
          data-testid="capture-details-sheet-overlay"
          className="modal-backdrop fixed inset-0 z-50"
        />
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center px-4 pb-4 sm:items-center sm:pb-0">
          <Dialog.Content className="modal-shadow pointer-events-auto w-full max-w-2xl rounded-[1.75rem] border border-outline-variant/20 bg-surface-container-lowest p-6">
            <Dialog.Title className="font-headline text-xl font-bold tracking-tight text-on-surface">
              Capture Details
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-6 text-on-surface-variant">
              Secondary capture output for review. Main review inputs stay focused on line items, notes, and pricing.
            </Dialog.Description>

            <div className="mt-4 max-h-[70vh] space-y-5 overflow-y-auto pr-1">
              <section className="space-y-2">
                <h3 className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                  New Suggestions From Latest Capture
                </h3>
                {visibleAppendSuggestions.length === 0 ? renderEmptySection("No new suggestions from the latest capture.") : (
                  <ul className="space-y-2">
                    {visibleAppendSuggestions.map((suggestion) => {
                      const pricingField = formatPricingField(
                        suggestion.field === "notes" ? null : suggestion.field,
                      );
                      const itemState = hiddenDetailState?.[suggestion.id];
                      return (
                        <li
                          key={suggestion.id}
                          className="rounded-lg border border-outline-variant/30 bg-surface-container-high p-3 text-sm text-on-surface"
                        >
                          <p className="font-semibold">
                            {suggestion.field === "notes" ? "Notes suggestion" : "Pricing suggestion"}
                            {pricingField ? ` (${pricingField})` : ""}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-on-surface-variant">{suggestion.text}</p>
                          <div className="mt-3 flex items-center gap-2">
                            {itemState?.reviewed ? (
                              <span className="rounded-full bg-success/10 px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-success">
                                Reviewed
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="rounded-md border border-outline-variant/40 px-2 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-on-surface-variant transition-colors hover:bg-surface-container-lowest disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={isMutating || !onReviewHiddenItem}
                                onClick={() => { void onReviewHiddenItem?.(suggestion.id); }}
                              >
                                Mark reviewed
                              </button>
                            )}
                            <button
                              type="button"
                              className="rounded-md border border-outline-variant/40 px-2 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-on-surface-variant transition-colors hover:bg-surface-container-lowest disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={isMutating || !onDismissHiddenItem}
                              onClick={() => { void onDismissHiddenItem?.(suggestion.id); }}
                            >
                              Dismiss
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                  Unresolved Capture Details
                </h3>
                {visibleUnresolvedSegments.length === 0 ? renderEmptySection("No unresolved capture details.") : (
                  <ul className="space-y-2">
                    {visibleUnresolvedSegments.map((segment) => {
                      const itemState = hiddenDetailState?.[segment.id];
                      return (
                        <li
                          key={segment.id}
                          className="rounded-lg border border-outline-variant/30 bg-surface-container-high p-3 text-sm text-on-surface"
                        >
                          <p className="font-semibold">
                            {(segment.reason ?? "leftover_classification").replaceAll("_", " ")}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-on-surface-variant">{segment.text}</p>
                          <div className="mt-3 flex items-center gap-2">
                            {itemState?.reviewed ? (
                              <span className="rounded-full bg-success/10 px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-success">
                                Reviewed
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="rounded-md border border-outline-variant/40 px-2 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-on-surface-variant transition-colors hover:bg-surface-container-lowest disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={isMutating || !onReviewHiddenItem}
                                onClick={() => { void onReviewHiddenItem?.(segment.id); }}
                              >
                                Mark reviewed
                              </button>
                            )}
                            <button
                              type="button"
                              className="rounded-md border border-outline-variant/40 px-2 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-on-surface-variant transition-colors hover:bg-surface-container-lowest disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={isMutating || !onDismissHiddenItem}
                              onClick={() => { void onDismissHiddenItem?.(segment.id); }}
                            >
                              Dismiss
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                  AI Review Notes
                </h3>
                {visibleConfidenceNotes.length === 0 ? renderEmptySection("No AI review notes.") : (
                  <ul className="space-y-2">
                    {visibleConfidenceNotes.map((note) => (
                      <li
                        key={note.id}
                        className="rounded-lg border border-outline-variant/30 bg-surface-container-high p-3 text-sm text-on-surface whitespace-pre-wrap"
                      >
                        {note.text}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                  Transcript
                </h3>
                <div className="rounded-lg border border-outline-variant/30 bg-surface-container-high p-3 text-sm leading-6 text-on-surface whitespace-pre-wrap">
                  {transcript.trim().length > 0 ? transcript : "No transcript notes captured."}
                </div>
              </section>
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
