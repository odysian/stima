import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useQuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";
import type { LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";
import { AIConfidenceBanner } from "@/shared/components/AIConfidenceBanner";
import { Button } from "@/shared/components/Button";
import { Input } from "@/shared/components/Input";

function parsePrice(rawPrice: string): number | null {
  const trimmedPrice = rawPrice.trim();
  if (trimmedPrice.length === 0) {
    return null;
  }

  const parsed = Number(trimmedPrice);
  return Number.isFinite(parsed) ? parsed : null;
}

export function EditLineItemScreen(): React.ReactElement | null {
  const navigate = useNavigate();
  const { lineItemIndex } = useParams<{ lineItemIndex: string }>();
  const { draft, updateLineItem, removeLineItem } = useQuoteDraft();
  const [saveError, setSaveError] = useState<string | null>(null);

  const parsedLineItemIndex = useMemo(() => {
    const parsed = Number.parseInt(lineItemIndex ?? "", 10);
    return Number.isNaN(parsed) ? -1 : parsed;
  }, [lineItemIndex]);

  const currentItem = useMemo<LineItemDraftWithFlags | null>(() => {
    if (!draft) {
      return null;
    }
    return draft.lineItems[parsedLineItemIndex] ?? null;
  }, [draft, parsedLineItemIndex]);

  const [description, setDescription] = useState(() => currentItem?.description ?? "");
  const [details, setDetails] = useState(() => currentItem?.details ?? "");
  const [priceInput, setPriceInput] = useState(() =>
    currentItem?.price != null ? currentItem.price.toString() : "",
  );

  useEffect(() => {
    if (!draft) {
      navigate("/", { replace: true });
      return;
    }

    if (parsedLineItemIndex < 0 || !currentItem) {
      navigate("/quotes/review", { replace: true });
    }
  }, [currentItem, draft, navigate, parsedLineItemIndex]);

  if (!draft || parsedLineItemIndex < 0 || !currentItem) {
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
    updateLineItem(parsedLineItemIndex, {
      ...currentItem,
      description: trimmedDescription,
      details: details.trim().length > 0 ? details.trim() : null,
      price: parsedPrice,
    });
    navigate("/quotes/review");
  }

  function onDelete(): void {
    removeLineItem(parsedLineItemIndex);
    navigate("/quotes/review");
  }

  return (
    <main className="min-h-screen bg-surface-container-low pb-28">
      <header className="fixed top-0 z-50 flex h-16 w-full items-center bg-white px-4">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
          <button
            type="button"
            aria-label="Back to review"
            className="rounded-full p-2 transition-transform duration-150 hover:bg-slate-50 active:scale-95"
            onClick={() => navigate("/quotes/review")}
          >
            <span className="material-symbols-outlined text-emerald-900">arrow_back</span>
          </button>
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-wider text-outline">REVIEW &amp; EDIT</span>
            <h1 className="font-headline text-lg font-bold tracking-tight text-emerald-900">Edit Line Item</h1>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-2xl space-y-6 px-4 pb-6 pt-20">
        {currentItem.flagged ? (
          <AIConfidenceBanner message={currentItem.flagReason ?? "This line item needs a manual review."} />
        ) : null}

        {saveError ? (
          <p role="alert" className="rounded-lg border-l-4 border-error bg-error-container p-4 text-sm text-error">
            {saveError}
          </p>
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

      <footer className="fixed bottom-0 z-50 w-full bg-white/80 px-4 pb-6 pt-4 shadow-[0_-4px_24px_rgba(0,0,0,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
          <Button variant="primary" className="w-full" onClick={onSaveChanges}>
            Save Changes
          </Button>
          <Button variant="destructive" className="w-full" onClick={onDelete}>
            Delete Line Item
          </Button>
        </div>
      </footer>
    </main>
  );
}
