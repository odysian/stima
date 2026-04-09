import { Button } from "@/shared/components/Button";
import { ScreenFooter } from "@/shared/components/ScreenFooter";

interface ReviewActionFooterProps {
  requiresCustomerAssignment: boolean;
  isInteractionLocked: boolean;
  isSavingDraft: boolean;
  isContinuing: boolean;
  onSaveDraft: () => void;
  onContinueToPreview: () => void;
}

export function ReviewActionFooter({
  requiresCustomerAssignment,
  isInteractionLocked,
  isSavingDraft,
  isContinuing,
  onSaveDraft,
  onContinueToPreview,
}: ReviewActionFooterProps): React.ReactElement {
  const isContinueDisabled = requiresCustomerAssignment || isInteractionLocked;

  return (
    <ScreenFooter>
      <div className="mx-auto w-full max-w-2xl space-y-2">
        <div className="flex flex-col gap-3 sm:flex-row">
          {requiresCustomerAssignment ? (
            <>
              <Button
                type="button"
                variant="primary"
                className="w-full sm:flex-1"
                disabled={isInteractionLocked}
                isLoading={isSavingDraft}
                onClick={onSaveDraft}
              >
                Save Draft
              </Button>
              <button
                type="button"
                className="w-full cursor-not-allowed rounded-lg border border-outline-variant/30 bg-surface-container-low px-4 py-3 font-semibold text-on-surface-variant opacity-70 sm:flex-1"
                disabled
              >
                Continue to Preview
              </button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="primary"
                className="w-full sm:flex-1"
                disabled={isContinueDisabled}
                isLoading={isContinuing}
                onClick={onContinueToPreview}
              >
                Continue to Preview
              </Button>
              <button
                type="button"
                className="w-full cursor-pointer rounded-lg border border-outline-variant/30 bg-surface-container-low px-4 py-3 font-semibold text-on-surface transition-colors hover:bg-surface-container-lowest disabled:cursor-not-allowed disabled:opacity-60 sm:flex-1"
                disabled={isInteractionLocked}
                onClick={onSaveDraft}
              >
                Save Draft
              </button>
            </>
          )}
        </div>
        {requiresCustomerAssignment ? (
          <p className="text-center text-xs text-warning">
            Continue to Preview is disabled until a customer is assigned.
          </p>
        ) : null}
      </div>
    </ScreenFooter>
  );
}

