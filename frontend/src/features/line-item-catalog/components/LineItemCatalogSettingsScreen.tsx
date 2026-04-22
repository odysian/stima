import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { lineItemCatalogService } from "@/features/line-item-catalog/services/lineItemCatalogService";
import type { LineItemCatalogItem } from "@/features/line-item-catalog/types/lineItemCatalog.types";
import { BottomNav } from "@/shared/components/BottomNav";
import { Button } from "@/shared/components/Button";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { Input } from "@/shared/components/Input";
import { NumericField } from "@/ui/NumericField";
import { useToast } from "@/ui/Toast";

interface ParsedPriceInput {
  value: number | null;
  error: string | null;
}

function parsePriceInput(priceInput: string): ParsedPriceInput {
  const trimmed = priceInput.replaceAll(",", "").trim();
  if (trimmed.length === 0) {
    return { value: null, error: null };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { value: null, error: "Default price must be a non-negative number." };
  }

  return { value: parsed, error: null };
}

function toPriceInput(value: number | null): string {
  if (value === null) {
    return "";
  }
  return value.toString();
}

function formatPriceLabel(value: number | null): string {
  if (value === null) {
    return "No default price";
  }
  return `$${value.toFixed(2)}`;
}

export function LineItemCatalogSettingsScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { show } = useToast();
  const [items, setItems] = useState<LineItemCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [defaultPriceInput, setDefaultPriceInput] = useState("");
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [itemPendingDelete, setItemPendingDelete] = useState<LineItemCatalogItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const isEditMode = activeItemId !== null;

  useEffect(() => {
    let isActive = true;

    async function loadItems(): Promise<void> {
      setIsLoading(true);
      setLoadError(null);
      try {
        const nextItems = await lineItemCatalogService.listItems();
        if (isActive) {
          setItems(nextItems);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load line item catalog";
        if (isActive) {
          setLoadError(message);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadItems();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }
    show({ message: toastMessage, variant: "success" });
    setToastMessage(null);
  }, [show, toastMessage]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [items]);

  function resetForm(): void {
    setActiveItemId(null);
    setTitle("");
    setDetails("");
    setDefaultPriceInput("");
    setFormError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      setFormError("Title is required.");
      return;
    }

    const parsedPrice = parsePriceInput(defaultPriceInput);
    if (parsedPrice.error) {
      setFormError(parsedPrice.error);
      return;
    }

    const normalizedDetails = details.trim();
    const nextDetails = normalizedDetails.length > 0 ? normalizedDetails : null;

    setIsSubmitting(true);
    try {
      if (activeItemId) {
        const updatedItem = await lineItemCatalogService.updateItem(activeItemId, {
          title: trimmedTitle,
          details: nextDetails,
          defaultPrice: parsedPrice.value,
        });
        setItems((currentItems) =>
          currentItems.map((item) => (item.id === updatedItem.id ? updatedItem : item)),
        );
        setToastMessage("Catalog item updated.");
      } else {
        const createdItem = await lineItemCatalogService.createItem({
          title: trimmedTitle,
          details: nextDetails,
          defaultPrice: parsedPrice.value,
        });
        setItems((currentItems) => [createdItem, ...currentItems]);
        setToastMessage("Catalog item created.");
      }
      resetForm();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save catalog item";
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEdit(item: LineItemCatalogItem): void {
    setActiveItemId(item.id);
    setTitle(item.title);
    setDetails(item.details ?? "");
    setDefaultPriceInput(toPriceInput(item.defaultPrice));
    setFormError(null);
  }

  async function confirmDelete(): Promise<void> {
    if (!itemPendingDelete) {
      return;
    }

    setIsDeleting(true);
    setFormError(null);
    try {
      await lineItemCatalogService.deleteItem(itemPendingDelete.id);
      setItems((currentItems) =>
        currentItems.filter((item) => item.id !== itemPendingDelete.id),
      );
      if (activeItemId === itemPendingDelete.id) {
        resetForm();
      }
      setToastMessage("Catalog item deleted.");
      setItemPendingDelete(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete catalog item";
      setFormError(message);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background pb-24 pt-16">
      <ScreenHeader
        title="Line Item Catalog"
        backLabel="Back to settings"
        onBack={() => navigate("/settings")}
      />

      <section className="mx-auto w-full max-w-3xl space-y-4 px-4 pt-4">
        {isLoading ? (
          <p role="status" className="text-sm text-on-surface-variant">
            Loading catalog items...
          </p>
        ) : null}

        {!isLoading && loadError ? (
          <FeedbackMessage variant="error">{loadError}</FeedbackMessage>
        ) : null}

        {!isLoading && !loadError ? (
          <>
            <section className="ghost-shadow rounded-xl bg-surface-container-lowest p-6">
              <h2 className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                {isEditMode ? "Edit Catalog Item" : "Add Catalog Item"}
              </h2>

              <form className="mt-4 space-y-3" onSubmit={(event) => void handleSubmit(event)}>
                {formError ? <FeedbackMessage variant="error">{formError}</FeedbackMessage> : null}

                <Input
                  id="line-item-catalog-title"
                  label="Title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />

                <div className="space-y-1">
                  <label htmlFor="line-item-catalog-details" className="text-sm font-medium text-on-surface">
                    Details (optional)
                  </label>
                  <textarea
                    id="line-item-catalog-details"
                    rows={3}
                    value={details}
                    onChange={(event) => setDetails(event.target.value)}
                    className="w-full rounded-lg border border-outline-variant/30 bg-surface-container-high p-4 text-sm text-on-surface outline-none transition-all focus:border-primary focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <NumericField
                  id="line-item-catalog-default-price"
                  label="Default price (optional)"
                  value={defaultPriceInput}
                  onChange={setDefaultPriceInput}
                  placeholder="0.00"
                  currencySymbol="$"
                  step={0.01}
                  formatOnBlur
                  showStepControls
                />

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="submit"
                    className="min-w-[9rem] px-4 py-2"
                    isLoading={isSubmitting}
                  >
                    {isEditMode ? "Update Item" : "Create Item"}
                  </Button>
                  {isEditMode ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={resetForm}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </form>
            </section>

            <section className="rounded-xl bg-surface-container-low p-4">
              <h2 className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                Saved Items
              </h2>
              {sortedItems.length === 0 ? (
                <p className="mt-3 text-sm text-on-surface-variant">
                  No catalog items yet. Create one to reuse it in quote line items.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {sortedItems.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <h3 className="truncate text-sm font-semibold text-on-surface">{item.title}</h3>
                          <p className="text-xs text-on-surface-variant">{formatPriceLabel(item.defaultPrice)}</p>
                          {item.details ? (
                            <p className="text-sm text-on-surface-variant">{item.details}</p>
                          ) : null}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="min-h-9 px-3 text-xs"
                            onClick={() => startEdit(item)}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="min-h-9 px-3 text-xs"
                            onClick={() => setItemPendingDelete(item)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </section>

      <BottomNav active="settings" />

      {itemPendingDelete ? (
        <ConfirmModal
          title="Delete catalog item?"
          body={`"${itemPendingDelete.title}" will be removed from your catalog.`}
          confirmLabel={isDeleting ? "Deleting..." : "Delete"}
          cancelLabel="Cancel"
          onConfirm={() => void confirmDelete()}
          onCancel={() => setItemPendingDelete(null)}
          variant="destructive"
        />
      ) : null}
    </main>
  );
}
