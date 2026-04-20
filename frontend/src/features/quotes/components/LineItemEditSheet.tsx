import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

import type { LineItemCatalogItem } from "@/features/line-item-catalog/types/lineItemCatalog.types";
import type { LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";
import { LineItemCatalogTabPanel } from "@/features/quotes/components/LineItemCatalogTabPanel";
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
  }) => Promise<LineItemCatalogItem>;
  onDeleteFromCatalog?: (id: string) => Promise<void>;
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

export function LineItemEditSheet({
  open,
  mode,
  initialLineItem,
  onClose,
  onSave,
  onSaveToCatalog,
  onDeleteFromCatalog,
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
  const [savedCatalogItem, setSavedCatalogItem] = useState<LineItemCatalogItem | null>(null);
  const [isCatalogMutationInFlight, setIsCatalogMutationInFlight] = useState(false);
  const title = mode === "edit" ? "Edit Line Item" : "Add Line Item";
  const showManualFields = mode === "edit" || activeAddTab === "manual";
  const canSaveToCatalog = showManualFields && savedCatalogItem === null;
  const canDeleteSavedCatalogItem = savedCatalogItem !== null;
  const bookmarkIcon = canDeleteSavedCatalogItem ? "bookmark" : "bookmark_add";

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
      setCatalogItems((currentItems) => {
        const loadedIds = new Set(items.map((item) => item.id));
        const localOnlyItems = currentItems.filter((item) => !loadedIds.has(item.id));
        return [...localOnlyItems, ...items];
      });
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
    if (mode === "add") {
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

  function addLineItemAndClose(): void {
    const parsedLineItem = parseManualLineItem();
    if (!parsedLineItem) return;
    onSave(parsedLineItem);
    onClose();
  }

  async function saveToCatalog(): Promise<void> {
    if (!onSaveToCatalog || !canSaveToCatalog || isCatalogMutationInFlight) {
      return;
    }

    const parsedLineItem = parseManualLineItem();
    if (!parsedLineItem) {
      return;
    }

    setIsCatalogMutationInFlight(true);
    try {
      const createdItem = await onSaveToCatalog({
        title: parsedLineItem.description,
        details: parsedLineItem.details ?? null,
        defaultPrice: parsedLineItem.price,
      });
      setSavedCatalogItem(createdItem);
      setCatalogItems((currentItems) => [
        createdItem,
        ...currentItems.filter((item) => item.id !== createdItem.id),
      ]);
      setFormError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save line item to catalog";
      setFormError(message);
    } finally {
      setIsCatalogMutationInFlight(false);
    }
  }

  async function unsaveFromCatalog(): Promise<void> {
    if (!savedCatalogItem || !onDeleteFromCatalog || isCatalogMutationInFlight) {
      return;
    }

    setIsCatalogMutationInFlight(true);
    try {
      await onDeleteFromCatalog(savedCatalogItem.id);
      setCatalogItems((currentItems) =>
        currentItems.filter((item) => item.id !== savedCatalogItem.id));
      setSavedCatalogItem(null);
      setFormError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to remove line item from catalog";
      setFormError(message);
    } finally {
      setIsCatalogMutationInFlight(false);
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
            aria-describedby={showManualFields ? undefined : "line-item-sheet-catalog-description"}
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
                {onSaveToCatalog && showManualFields ? (
                  <button
                    type="button"
                    aria-label="Save to catalog"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-primary/30 bg-primary/5 text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isCatalogMutationInFlight || (!canSaveToCatalog && !canDeleteSavedCatalogItem)}
                    onClick={() => {
                      if (savedCatalogItem) {
                        void unsaveFromCatalog();
                        return;
                      }
                      void saveToCatalog();
                    }}
                  >
                    <span
                      className="material-symbols-outlined text-base leading-none"
                      style={canDeleteSavedCatalogItem ? { fontVariationSettings: '"FILL" 1, "wght" 400, "GRAD" 0, "opsz" 24' } : undefined}
                    >
                      {bookmarkIcon}
                    </span>
                  </button>
                ) : null}
                {mode === "add" && showManualFields ? (
                  <button
                    type="button"
                    aria-label="Add line item"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-primary/30 bg-primary/5 text-primary transition-colors hover:bg-primary/10"
                    onClick={addLineItemAndClose}
                  >
                    <span className="material-symbols-outlined text-base leading-none">check</span>
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
            {!showManualFields ? (
              <Dialog.Description
                id="line-item-sheet-catalog-description"
                className="mt-2 text-sm leading-6 text-on-surface-variant"
              >
                Pick a catalog item to insert.
              </Dialog.Description>
            ) : null}

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
                        if (savedCatalogItem) {
                          setSavedCatalogItem(null);
                        }
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
                        if (savedCatalogItem) {
                          setSavedCatalogItem(null);
                        }
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
                        if (savedCatalogItem) {
                          setSavedCatalogItem(null);
                        }
                        if (formError) {
                          setFormError(null);
                        }
                      }}
                      className="w-full rounded-lg bg-surface-container-high px-4 py-3 font-body text-sm text-on-surface placeholder:text-outline transition-all focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </section>
                </div>
              ) : (
                <LineItemCatalogTabPanel
                  loadState={catalogLoadState}
                  loadError={catalogLoadError}
                  items={catalogItems}
                  onRetry={() => {
                    setCatalogLoadState("idle");
                    void loadCatalogItems();
                  }}
                  onInsertItem={handleInsertCatalogItem}
                />
              )}
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
