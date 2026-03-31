import { type ReviewDocumentType } from "@/features/quotes/components/ReviewDocumentTypeSelector";
import { Button } from "@/shared/components/Button";
import { ScreenFooter } from "@/shared/components/ScreenFooter";

interface ReviewSubmitFooterProps {
  documentType: ReviewDocumentType;
  hasNullPrices: boolean;
  canSubmit: boolean;
  isInteractionLocked: boolean;
  isSaving: boolean;
}

export function ReviewSubmitFooter({
  documentType,
  hasNullPrices,
  canSubmit,
  isInteractionLocked,
  isSaving,
}: ReviewSubmitFooterProps): React.ReactElement {
  return (
    <ScreenFooter>
      <div className="mx-auto w-full max-w-2xl">
        {hasNullPrices ? (
          <p className="mb-2 rounded-lg bg-warning-container px-3 py-2 text-center text-xs text-warning">
            {documentType === "quote"
              ? "Review missing prices before sharing. Quote generation stays enabled, and any blank prices will render as \"TBD\"."
              : "Review missing prices before creating the invoice. Blank prices will render as \"TBD\"."}
          </p>
        ) : null}
        <Button
          type="submit"
          form="quote-review-form"
          variant="primary"
          className="w-full"
          disabled={!canSubmit || isInteractionLocked}
          isLoading={isSaving}
        >
          {documentType === "quote" ? "Generate Quote" : "Create Invoice"}
        </Button>
      </div>
    </ScreenFooter>
  );
}
