import * as Dialog from "@radix-ui/react-dialog";

import type { ExtractionReviewHiddenDetails, HiddenItemState } from "@/features/quotes/types/quote.types";
import { resolveCaptureDetailsActionableItems } from "@/features/quotes/utils/captureDetails";

interface CaptureDetailsSheetProps {
  open: boolean;
  onClose: () => void;
  transcript: string;
  hiddenDetails?: ExtractionReviewHiddenDetails;
  hiddenDetailState?: Record<string, HiddenItemState>;
  onDismissHiddenItem?: (itemId: string) => Promise<void> | void;
  isMutating?: boolean;
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

function buildActionableLabel(item: {
  kind: "append_suggestion" | "unresolved_segment" | "confidence_note";
  field: "notes" | "explicit_total" | "deposit_amount" | "tax_rate" | "discount" | null;
  reason: string | null;
}): string {
  if (item.kind === "append_suggestion") {
    const pricingField = formatPricingField(item.field === "notes" ? null : item.field);
    return item.field === "notes"
      ? "Notes suggestion"
      : `Pricing suggestion${pricingField ? ` (${pricingField})` : ""}`;
  }
  if (item.kind === "unresolved_segment") {
    return (item.reason ?? "leftover_classification").replaceAll("_", " ");
  }
  return "Capture note";
}

export function CaptureDetailsSheet({
  open,
  onClose,
  transcript,
  hiddenDetails,
  hiddenDetailState,
  onDismissHiddenItem,
  isMutating = false,
}: CaptureDetailsSheetProps): React.ReactElement {
  const actionableItems = resolveCaptureDetailsActionableItems(hiddenDetails)
    .filter((item) => !hiddenDetailState?.[item.id]?.dismissed);

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
                  Actionable Capture Details
                </h3>
                {actionableItems.length > 0 ? (
                  <ul className="space-y-2">
                    {actionableItems.map((item) => (
                      <li
                        key={item.id}
                        className="rounded-lg border border-outline-variant/30 bg-surface-container-high p-3 text-sm text-on-surface"
                      >
                        <p className="font-semibold">{buildActionableLabel(item)}</p>
                        <p className="mt-1 whitespace-pre-wrap text-on-surface-variant">{item.text}</p>
                        <div className="mt-3">
                          <button
                            type="button"
                            className="rounded-md border border-outline-variant/40 px-2 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-on-surface-variant transition-colors hover:bg-surface-container-lowest disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isMutating || !onDismissHiddenItem}
                            onClick={() => { void onDismissHiddenItem?.(item.id); }}
                          >
                            Dismiss
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-on-surface-variant">No actionable capture details.</p>
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
