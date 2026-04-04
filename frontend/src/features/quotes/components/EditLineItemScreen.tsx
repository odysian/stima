import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useQuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";
import { HOME_ROUTE } from "@/features/quotes/utils/workflowNavigation";
import type { LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";
import { AIConfidenceBanner } from "@/shared/components/AIConfidenceBanner";
import { Button } from "@/shared/components/Button";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { Input } from "@/shared/components/Input";
import { ScreenFooter } from "@/shared/components/ScreenFooter";
import { WorkflowScreenHeader } from "@/shared/components/WorkflowScreenHeader";
import {
  LINE_ITEM_DESCRIPTION_MAX_CHARS,
  LINE_ITEM_DETAILS_MAX_CHARS,
} from "@/shared/lib/inputLimits";

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
    navigate("/quotes/review", { replace: true });
  }

  function onDelete(): void {
    removeLineItem(parsedLineItemIndex);
    navigate("/quotes/review", { replace: true });
  }

  return (
    <main className="min-h-screen bg-surface-container-low pb-28">
      <WorkflowScreenHeader
        title="Edit Line Item"
        eyebrow="REVIEW & EDIT"
        backLabel="Back to review"
        onBack={() => navigate("/quotes/review", { replace: true })}
        onExitHome={() => navigate(HOME_ROUTE, { replace: true })}
      />

      <section className="mx-auto w-full max-w-2xl space-y-6 px-4 pb-6 pt-20">
        {currentItem.flagged ? (
          <AIConfidenceBanner message={currentItem.flagReason ?? "This line item needs a manual review."} />
        ) : null}

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
              maxLength={LINE_ITEM_DESCRIPTION_MAX_CHARS}
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
              maxLength={LINE_ITEM_DETAILS_MAX_CHARS}
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
