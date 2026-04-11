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
          <button
            type="button"
            className="w-full cursor-pointer rounded-lg border border-outline-variant/30 bg-surface-container-low px-4 py-3 font-semibold text-on-surface transition-colors hover:bg-surface-container-lowest disabled:cursor-not-allowed disabled:opacity-60 sm:flex-1"
            disabled={isInteractionLocked || isSavingDraft}
            onClick={onSaveDraft}
          >
            {isSavingDraft ? "Loading..." : "Save Draft"}
          </button>
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
