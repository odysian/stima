import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useInvoiceEdit } from "@/features/invoices/hooks/useInvoiceEdit";
import { HOME_ROUTE } from "@/features/quotes/utils/workflowNavigation";
import { Button } from "@/shared/components/Button";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { Input } from "@/shared/components/Input";
import { ScreenFooter } from "@/shared/components/ScreenFooter";
import { WorkflowScreenHeader } from "@/shared/components/WorkflowScreenHeader";

function parsePrice(rawPrice: string): number | null {
  const trimmedPrice = rawPrice.trim();
  if (trimmedPrice.length === 0) {
    return null;
  }

  const parsed = Number(trimmedPrice);
  return Number.isFinite(parsed) ? parsed : null;
}

export function EditInvoiceLineItemScreen(): React.ReactElement | null {
  const navigate = useNavigate();
  const { id, lineItemIndex } = useParams<{ id: string; lineItemIndex: string }>();
  const { draft, updateLineItem, removeLineItem } = useInvoiceEdit();
  const [saveError, setSaveError] = useState<string | null>(null);

  const parsedLineItemIndex = Number.parseInt(lineItemIndex ?? "", 10);
  const safeLineItemIndex = Number.isNaN(parsedLineItemIndex) ? -1 : parsedLineItemIndex;
  const hasMatchingDraft = !!draft && !!id && draft.invoiceId === id;
  const currentItem = hasMatchingDraft ? draft.lineItems[safeLineItemIndex] ?? null : null;

  const [description, setDescription] = useState(() => currentItem?.description ?? "");
  const [details, setDetails] = useState(() => currentItem?.details ?? "");
  const [priceInput, setPriceInput] = useState(() =>
    currentItem?.price != null ? currentItem.price.toString() : "",
  );

  useEffect(() => {
    if (!hasMatchingDraft) {
      navigate("/", { replace: true });
      return;
    }

    if (safeLineItemIndex < 0 || !currentItem) {
      navigate(`/invoices/${id}/edit`, { replace: true });
    }
  }, [currentItem, hasMatchingDraft, id, navigate, safeLineItemIndex]);

  if (!hasMatchingDraft || safeLineItemIndex < 0 || !currentItem || !id) {
    return null;
  }

  function onSaveChanges(): void {
    const trimmedDescription = description.trim();
    if (trimmedDescription.length === 0) {
      setSaveError("Description is required.");
      return;
    }

    const parsedPrice = parsePrice(priceInput);
    if (priceInput.trim().length > 0 && parsedPrice === null) {
      setSaveError("Enter a valid number for price.");
      return;
    }

    setSaveError(null);
    updateLineItem(safeLineItemIndex, {
      ...currentItem,
      description: trimmedDescription,
      details: details.trim().length > 0 ? details.trim() : null,
      price: parsedPrice,
    });
    navigate(`/invoices/${id}/edit`, { replace: true });
  }

  function onDelete(): void {
    removeLineItem(safeLineItemIndex);
    navigate(`/invoices/${id}/edit`, { replace: true });
  }

  return (
    <main className="min-h-screen bg-surface-container-low pb-28">
      <WorkflowScreenHeader
        title="Edit Line Item"
        eyebrow="INVOICE EDITOR"
        backLabel="Back to edit invoice"
        onBack={() => navigate(`/invoices/${id}/edit`, { replace: true })}
        onExitHome={() => navigate(HOME_ROUTE, { replace: true })}
      />

      <section className="mx-auto w-full max-w-2xl space-y-6 px-4 pb-6 pt-20">
        {saveError ? (
          <FeedbackMessage variant="error">{saveError}</FeedbackMessage>
        ) : null}

        <section className="rounded-xl bg-surface-container-lowest p-6 ghost-shadow">
          <div className="space-y-4">
            <div className="flex items-end justify-between">
              <label htmlFor="line-item-description" className="font-headline text-sm font-bold text-on-surface">
                Description
              </label>
              <span className="text-xs font-bold uppercase text-primary">REQUIRED</span>
            </div>
            <Input
              id="line-item-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />

            <div className="flex items-end justify-between">
              <label htmlFor="line-item-details" className="font-headline text-sm font-bold text-on-surface">
                Details
              </label>
              <span className="text-xs font-bold uppercase text-outline">OPTIONAL</span>
            </div>
            <Input
              id="line-item-details"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
            />

            <label htmlFor="line-item-price" className="font-headline text-sm font-bold text-on-surface">
              Price
            </label>
            <Input
              id="line-item-price"
              placeholder="$ 0.00"
              value={priceInput}
              onChange={(event) => setPriceInput(event.target.value)}
            />
          </div>
        </section>
      </section>

      <ScreenFooter>
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
          <Button variant="primary" className="w-full" onClick={onSaveChanges}>
            Save Changes
          </Button>
          <Button variant="destructive" className="w-full" onClick={onDelete}>
            Delete Line Item
          </Button>
        </div>
      </ScreenFooter>
    </main>
  );
}
