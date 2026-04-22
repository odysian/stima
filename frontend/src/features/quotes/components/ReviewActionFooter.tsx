import { Button } from "@/shared/components/Button";
import { ScreenFooter } from "@/shared/components/ScreenFooter";

interface ReviewActionFooterProps {
  requiresCustomerAssignment: boolean;
  isInteractionLocked: boolean;
  isSavingDraft: boolean;
  isContinuing: boolean;
  primaryActionLabel: string;
  onSaveDraft: () => void;
  onPrimaryAction: () => void;
}

export function ReviewActionFooter({
  requiresCustomerAssignment,
  isInteractionLocked,
  isSavingDraft,
  isContinuing,
  primaryActionLabel,
  onSaveDraft,
  onPrimaryAction,
}: ReviewActionFooterProps): React.ReactElement {
  const isContinueDisabled = requiresCustomerAssignment || isInteractionLocked;

  return (
    <ScreenFooter>
      <div className="mx-auto w-full max-w-2xl space-y-2">
        <div className="flex flex-row gap-3">
          <Button
            type="button"
            variant="primary"
            className="w-full sm:flex-1"
            disabled={isContinueDisabled}
            isLoading={isContinuing}
            onClick={onPrimaryAction}
          >
            {primaryActionLabel}
          </Button>
          <Button
            type="button"
            variant="tonal"
            className="w-full sm:flex-1"
            disabled={isInteractionLocked || isSavingDraft}
            isLoading={isSavingDraft}
            onClick={onSaveDraft}
          >
            Save Draft
          </Button>
        </div>
        {requiresCustomerAssignment ? (
          <p className="text-center text-xs text-warning">
            {primaryActionLabel} is disabled until a customer is assigned.
          </p>
        ) : null}
      </div>
    </ScreenFooter>
  );
}
