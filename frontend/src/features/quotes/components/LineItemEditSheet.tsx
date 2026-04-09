import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

import type { LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import {
  LINE_ITEM_DESCRIPTION_MAX_CHARS,
  LINE_ITEM_DETAILS_MAX_CHARS,
} from "@/shared/lib/inputLimits";

interface LineItemEditSheetProps {
  open: boolean;
  mode: "add" | "edit";
  initialLineItem: LineItemDraftWithFlags;
  onClose: () => void;
  onSave: (nextLineItem: LineItemDraftWithFlags) => void;
  onDelete?: () => void;
}

interface ParsedPrice {
  value: number | null;
  valid: boolean;
}

function parsePrice(value: string): ParsedPrice {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { value: null, valid: true };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { value: null, valid: false };
  }

  return { value: parsed, valid: true };
}

export function LineItemEditSheet({
  open,
  mode,
  initialLineItem,
  onClose,
  onSave,
  onDelete,
}: LineItemEditSheetProps): React.ReactElement {
  const descriptionInputRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState(initialLineItem.description);
  const [details, setDetails] = useState(initialLineItem.details ?? "");
  const [priceInput, setPriceInput] = useState(
    initialLineItem.price == null ? "" : initialLineItem.price.toString(),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const title = mode === "edit" ? "Edit Line Item" : "Add Line Item";

  function handleSave(): void {
    const trimmedDescription = description.trim();
    if (trimmedDescription.length === 0) {
      setFormError("Description is required.");
      return;
    }

    const parsedPrice = parsePrice(priceInput);
    if (!parsedPrice.valid) {
      setFormError("Enter a valid number for price.");
      return;
    }

    setFormError(null);
    onSave({
      ...initialLineItem,
      description: trimmedDescription,
      details: details.trim().length > 0 ? details.trim() : null,
      price: parsedPrice.value,
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay
          data-testid="line-item-edit-sheet-overlay"
          className="modal-backdrop fixed inset-0 z-50 flex items-end justify-center px-4 pb-4 sm:items-center sm:pb-0"
        />
        <Dialog.Content
          className="modal-shadow fixed inset-x-4 bottom-4 z-50 w-auto max-w-md rounded-[1.75rem] border border-outline-variant/20 bg-surface-container-lowest p-6 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            descriptionInputRef.current?.focus();
          }}
        >
          <Dialog.Title className="font-headline text-xl font-bold tracking-tight text-on-surface">
            {title}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-6 text-on-surface-variant">
            Update details now. Changes stay local until you save the review draft.
          </Dialog.Description>

          <div className="mt-4 space-y-4">
            {formError ? <FeedbackMessage variant="error">{formError}</FeedbackMessage> : null}

            <section className="space-y-2">
              <div className="flex items-end justify-between">
                <label htmlFor="line-item-sheet-description" className="font-headline text-sm font-bold text-on-surface">
                  Description
                </label>
                <span className="text-xs font-bold uppercase text-primary">Required</span>
              </div>
              <input
                id="line-item-sheet-description"
                ref={descriptionInputRef}
                type="text"
                maxLength={LINE_ITEM_DESCRIPTION_MAX_CHARS}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="w-full rounded-lg bg-surface-container-high px-4 py-3 font-body text-sm text-on-surface placeholder:text-outline transition-all focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </section>

            <section className="space-y-2">
              <div className="flex items-end justify-between">
                <label htmlFor="line-item-sheet-details" className="font-headline text-sm font-bold text-on-surface">
                  Details
                </label>
                <span className="text-xs font-bold uppercase text-outline">Optional</span>
              </div>
              <textarea
                id="line-item-sheet-details"
                rows={3}
                maxLength={LINE_ITEM_DETAILS_MAX_CHARS}
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                className="w-full rounded-lg border border-outline-variant/30 bg-surface-container-high p-4 text-sm text-on-surface placeholder:text-outline/70 outline-none transition-all focus:border-primary focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/20"
              />
            </section>

            <section className="space-y-2">
              <label htmlFor="line-item-sheet-price" className="font-headline text-sm font-bold text-on-surface">
                Price
              </label>
              <input
                id="line-item-sheet-price"
                type="text"
                inputMode="decimal"
                placeholder="$ 0.00"
                value={priceInput}
                onChange={(event) => setPriceInput(event.target.value)}
                className="w-full rounded-lg bg-surface-container-high px-4 py-3 font-body text-sm text-on-surface placeholder:text-outline transition-all focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </section>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
            <button
              type="button"
              className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-lg px-4 py-3 text-sm font-semibold forest-gradient text-on-primary transition-all active:scale-[0.98]"
              onClick={handleSave}
            >
              Save
            </button>
            <button
              type="button"
              className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-lg border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-lowest"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>

          {mode === "edit" && onDelete ? (
            <button
              type="button"
              className="mt-3 inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-lg bg-secondary px-4 py-3 text-sm font-semibold text-on-primary transition-all active:scale-[0.98]"
              onClick={onDelete}
            >
              Delete Line Item
            </button>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
