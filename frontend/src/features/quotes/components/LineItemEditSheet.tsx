import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

import type { LineItemCatalogItem } from "@/features/line-item-catalog/types/lineItemCatalog.types";
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
  onSaveToCatalog?: (lineItem: {
    title: string;
    details: string | null;
    defaultPrice: number | null;
  }) => Promise<void>;
  onLoadCatalogItems?: () => Promise<LineItemCatalogItem[]>;
  onRequestDelete?: () => void;
}

interface ParsedPrice {
  value: number | null;
  valid: boolean;
}

type AddLineItemTab = "manual" | "catalog";

type CatalogLoadState = "idle" | "loading" | "loaded" | "error";

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

function formatCatalogPrice(value: number | null): string {
  if (value === null) {
    return "No default price";
  }
  return `$${value.toFixed(2)}`;
}

export function LineItemEditSheet({
  open,
  mode,
  initialLineItem,
  onClose,
  onSave,
  onSaveToCatalog,
  onLoadCatalogItems,
  onRequestDelete,
}: LineItemEditSheetProps): React.ReactElement {
  const descriptionInputRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState(initialLineItem.description);
  const [details, setDetails] = useState(initialLineItem.details ?? "");
  const [priceInput, setPriceInput] = useState(
    initialLineItem.price == null ? "" : initialLineItem.price.toString(),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [activeAddTab, setActiveAddTab] = useState<AddLineItemTab>("manual");
  const [catalogItems, setCatalogItems] = useState<LineItemCatalogItem[]>([]);
  const [catalogLoadState, setCatalogLoadState] = useState<CatalogLoadState>("idle");
  const [catalogLoadError, setCatalogLoadError] = useState<string | null>(null);
  const [isSavingToCatalog, setIsSavingToCatalog] = useState(false);
  const title = mode === "edit" ? "Edit Line Item" : "Add Line Item";
  const showManualFields = mode === "edit" || activeAddTab === "manual";

  useEffect(() => {
    if (mode !== "add") {
      return;
    }
    setActiveAddTab("manual");
  }, [mode]);

  async function loadCatalogItems(): Promise<void> {
    if (
      !onLoadCatalogItems
      || catalogLoadState === "loading"
      || catalogLoadState === "loaded"
    ) {
      return;
    }

    setCatalogLoadState("loading");
    setCatalogLoadError(null);
    try {
      const items = await onLoadCatalogItems();
      setCatalogItems(items);
      setCatalogLoadState("loaded");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load catalog items";
      setCatalogLoadError(message);
      setCatalogLoadState("error");
    }
  }

  function parseManualLineItem(): LineItemDraftWithFlags | null {
    const trimmedDescription = description.trim();
    if (trimmedDescription.length === 0) {
      setFormError("Description is required.");
      return null;
    }

    const parsedPrice = parsePrice(priceInput);
    if (!parsedPrice.valid) {
      setFormError("Enter a valid number for price.");
      return null;
    }

    setFormError(null);
    return {
      ...initialLineItem,
      description: trimmedDescription,
      details: details.trim().length > 0 ? details.trim() : null,
      price: parsedPrice.value,
    };
  }

  function dismissWithAutosave(): void {
    if (!showManualFields) {
      onClose();
      return;
    }

    const parsedLineItem = parseManualLineItem();
    if (!parsedLineItem) {
      return;
    }

    onSave(parsedLineItem);
    onClose();
  }

  async function saveToCatalog(): Promise<void> {
    if (!onSaveToCatalog || !showManualFields || isSavingToCatalog) {
      return;
    }

    const parsedLineItem = parseManualLineItem();
    if (!parsedLineItem) {
      return;
    }

    setIsSavingToCatalog(true);
    try {
      await onSaveToCatalog({
        title: parsedLineItem.description,
        details: parsedLineItem.details ?? null,
        defaultPrice: parsedLineItem.price,
      });
      setFormError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save line item to catalog";
      setFormError(message);
    } finally {
      setIsSavingToCatalog(false);
    }
  }

  function handleInsertCatalogItem(item: LineItemCatalogItem): void {
    setFormError(null);
    onSave({
      description: item.title,
      details: item.details,
      price: item.defaultPrice,
      flagged: false,
      flagReason: null,
    });
    onClose();
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          dismissWithAutosave();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          data-testid="line-item-edit-sheet-overlay"
          className="modal-backdrop fixed inset-0 z-50"
        />
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center px-4 pb-4 sm:items-center sm:pb-0">
          <Dialog.Content
            className="modal-shadow pointer-events-auto w-full max-w-md rounded-[1.75rem] border border-outline-variant/20 bg-surface-container-lowest p-6"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              if (showManualFields) {
                descriptionInputRef.current?.focus();
              }
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <Dialog.Title className="font-headline text-xl font-bold tracking-tight text-on-surface">
                {title}
              </Dialog.Title>
              <div className="flex items-center gap-2">
                {onSaveToCatalog ? (
                  <button
                    type="button"
                    aria-label="Save to catalog"
                    className="inline-flex min-h-10 items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-3 text-xs font-bold uppercase tracking-wide text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isSavingToCatalog || !showManualFields}
                    onClick={() => {
                      void saveToCatalog();
                    }}
                  >
                    <span className="material-symbols-outlined text-base leading-none">bookmark_add</span>
                    {isSavingToCatalog ? "Saving" : "Save"}
                  </button>
                ) : null}
                {mode === "edit" && onRequestDelete ? (
                  <button
                    type="button"
                    aria-label="Delete line item"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-error/30 bg-error-container/40 text-error transition-colors hover:bg-error-container/60"
                    onClick={onRequestDelete}
                  >
                    <span className="material-symbols-outlined text-[1.125rem] leading-none">delete</span>
                  </button>
                ) : null}
              </div>
            </div>
            <Dialog.Description className="mt-2 text-sm leading-6 text-on-surface-variant">
              {showManualFields
                ? "Update details now. Changes stay local until you save the review draft."
                : "Choose a saved catalog item to insert into this draft."}
            </Dialog.Description>

            <div className="mt-4 space-y-4">
              {formError ? <FeedbackMessage variant="error">{formError}</FeedbackMessage> : null}

              {mode === "add" ? (
                <div
                  role="tablist"
                  aria-label="Add line item mode"
                  className="grid grid-cols-2 rounded-full bg-surface-container-high p-1"
                >
                  <button
                    id="line-item-tab-manual"
                    role="tab"
                    type="button"
                    aria-controls="line-item-tabpanel-manual"
                    aria-selected={activeAddTab === "manual"}
                    className={`rounded-full px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                      activeAddTab === "manual"
                        ? "bg-surface-container-lowest text-primary"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                    onClick={() => {
                      setFormError(null);
                      setActiveAddTab("manual");
                    }}
                  >
                    Manual
                  </button>
                  <button
                    id="line-item-tab-catalog"
                    role="tab"
                    type="button"
                    aria-controls="line-item-tabpanel-catalog"
                    aria-selected={activeAddTab === "catalog"}
                    className={`rounded-full px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                      activeAddTab === "catalog"
                        ? "bg-surface-container-lowest text-primary"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                    onClick={() => {
                      setFormError(null);
                      setActiveAddTab("catalog");
                      void loadCatalogItems();
                    }}
                  >
                    Catalog
                  </button>
                </div>
              ) : null}

              {showManualFields ? (
                <div id="line-item-tabpanel-manual" role={mode === "add" ? "tabpanel" : undefined} className="space-y-4">
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
                      onChange={(event) => {
                        setDescription(event.target.value);
                        if (formError) {
                          setFormError(null);
                        }
                      }}
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
                      rows={2}
                      maxLength={LINE_ITEM_DETAILS_MAX_CHARS}
                      value={details}
                      onChange={(event) => {
                        setDetails(event.target.value);
                        if (formError) {
                          setFormError(null);
                        }
                      }}
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
                      onChange={(event) => {
                        setPriceInput(event.target.value);
                        if (formError) {
                          setFormError(null);
                        }
                      }}
                      className="w-full rounded-lg bg-surface-container-high px-4 py-3 font-body text-sm text-on-surface placeholder:text-outline transition-all focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </section>
                </div>
              ) : (
                <div
                  id="line-item-tabpanel-catalog"
                  role={mode === "add" ? "tabpanel" : undefined}
                  className="space-y-2"
                >
                  {catalogLoadState === "loading" ? (
                    <p role="status" className="text-sm text-on-surface-variant">Loading catalog items...</p>
                  ) : null}

                  {catalogLoadState === "error" && catalogLoadError ? (
                    <div className="space-y-2">
                      <FeedbackMessage variant="error">{catalogLoadError}</FeedbackMessage>
                      <button
                        type="button"
                        className="inline-flex min-h-9 items-center rounded-lg border border-outline-variant/40 px-3 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container-low"
                        onClick={() => {
                          setCatalogLoadState("idle");
                          void loadCatalogItems();
                        }}
                      >
                        Retry
                      </button>
                    </div>
                  ) : null}

                  {catalogLoadState === "loaded" && catalogItems.length === 0 ? (
                    <p className="rounded-lg bg-surface-container-high p-4 text-sm text-on-surface-variant">
                      No catalog items yet. Save one from the Manual tab or from another line item.
                    </p>
                  ) : null}

                  {catalogLoadState === "loaded" && catalogItems.length > 0 ? (
                    <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
                      {catalogItems.map((item) => (
                        <li
                          key={item.id}
                          className="rounded-lg border border-outline-variant/20 bg-surface-container-high p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-on-surface">{item.title}</p>
                              <p className="text-xs text-on-surface-variant">{formatCatalogPrice(item.defaultPrice)}</p>
                              {item.details ? (
                                <p className="mt-1 text-sm text-on-surface-variant">{item.details}</p>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              className="inline-flex min-h-9 shrink-0 items-center rounded-lg border border-primary/40 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
                              onClick={() => handleInsertCatalogItem(item)}
                            >
                              Insert
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
