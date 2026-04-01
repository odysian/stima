import { type ReviewDocumentType } from "@/features/quotes/components/ReviewDocumentTypeSelector";
import { Button } from "@/shared/components/Button";
import { ScreenFooter } from "@/shared/components/ScreenFooter";

interface ReviewSubmitFooterProps {
  documentType: ReviewDocumentType;
  canSubmit: boolean;
  isInteractionLocked: boolean;
  isSaving: boolean;
}

export function ReviewSubmitFooter({
  documentType,
  canSubmit,
  isInteractionLocked,
  isSaving,
}: ReviewSubmitFooterProps): React.ReactElement {
  return (
    <ScreenFooter>
      <div className="mx-auto w-full max-w-2xl">
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
