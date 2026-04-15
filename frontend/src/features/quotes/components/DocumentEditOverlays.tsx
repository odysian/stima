import { LineItemEditSheet } from "@/features/quotes/components/LineItemEditSheet";
import { ReviewCustomerAssignmentSheet } from "@/features/quotes/components/ReviewCustomerAssignmentSheet";
import type { ReviewLineItemSheetState } from "@/features/quotes/components/reviewLineItemSheetState";
import type { LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { Toast } from "@/shared/components/Toast";

interface DocumentEditOverlaysProps {
  isAssignmentSheetOpen: boolean;
  currentCustomerId: string | null;
  onCloseAssignment: () => void;
  onAssignCustomer: (customerId: string) => Promise<void>;
  lineItemSheetState: ReviewLineItemSheetState | null;
  lineItemSheetInitialItem: LineItemDraftWithFlags;
  onCloseLineItemSheet: () => void;
  onSaveLineItem: (nextLineItem: LineItemDraftWithFlags) => void;
  onDeleteLineItem?: () => void;
  toastMessage: string | null;
  onDismissToast: () => void;
  showLeaveWarning: boolean;
  onLeaveConfirm: () => void;
  onLeaveCancel: () => void;
  showContinueWarning: boolean;
  onContinueConfirm: () => void;
  onContinueCancel: () => void;
}

export function DocumentEditOverlays({
  isAssignmentSheetOpen,
  currentCustomerId,
  onCloseAssignment,
  onAssignCustomer,
  lineItemSheetState,
  lineItemSheetInitialItem,
  onCloseLineItemSheet,
  onSaveLineItem,
  onDeleteLineItem,
  toastMessage,
  onDismissToast,
  showLeaveWarning,
  onLeaveConfirm,
  onLeaveCancel,
  showContinueWarning,
  onContinueConfirm,
  onContinueCancel,
}: DocumentEditOverlaysProps): React.ReactElement {
  return (
    <>
      {isAssignmentSheetOpen ? (
        <ReviewCustomerAssignmentSheet
          open={isAssignmentSheetOpen}
          currentCustomerId={currentCustomerId}
          onClose={onCloseAssignment}
          onAssignCustomer={onAssignCustomer}
        />
      ) : null}

      {lineItemSheetState ? (
        <LineItemEditSheet
          open
          mode={lineItemSheetState.mode}
          initialLineItem={lineItemSheetInitialItem}
          onClose={onCloseLineItemSheet}
          onSave={onSaveLineItem}
          onDelete={lineItemSheetState.mode === "edit" ? onDeleteLineItem : undefined}
        />
      ) : null}

      <Toast message={toastMessage} onDismiss={onDismissToast} />

      {showLeaveWarning ? (
        <ConfirmModal
          title="Leave this screen?"
          body="You have unsaved document edits. Leaving now will discard those changes."
          confirmLabel="Leave without saving"
          cancelLabel="Stay"
          onConfirm={onLeaveConfirm}
          onCancel={onLeaveCancel}
          variant="destructive"
        />
      ) : null}

      {showContinueWarning ? (
        <ConfirmModal
          title="Review pending extraction markers?"
          body="Notes and pricing still have pending review markers. Review now, or continue anyway."
          confirmLabel="Continue anyway"
          cancelLabel="Review now"
          onConfirm={onContinueConfirm}
          onCancel={onContinueCancel}
        />
      ) : null}
    </>
  );
}
