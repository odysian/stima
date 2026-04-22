import { LineItemEditSheet } from "@/features/quotes/components/LineItemEditSheet";
import { ReviewCustomerAssignmentSheet } from "@/features/quotes/components/ReviewCustomerAssignmentSheet";
import type { ReviewLineItemSheetState } from "@/features/quotes/components/reviewLineItemSheetState";
import type { LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";
import type { LineItemCatalogItem } from "@/features/line-item-catalog/types/lineItemCatalog.types";
import { ConfirmModal } from "@/shared/components/ConfirmModal";

interface DocumentEditOverlaysProps {
  isAssignmentSheetOpen: boolean;
  currentCustomerId: string | null;
  onCloseAssignment: () => void;
  onAssignCustomer: (customerId: string) => Promise<void>;
  lineItemSheetState: ReviewLineItemSheetState | null;
  lineItemSheetInitialItem: LineItemDraftWithFlags;
  onCloseLineItemSheet: () => void;
  onSaveLineItem: (nextLineItem: LineItemDraftWithFlags) => void;
  onSaveLineItemToCatalog: (lineItem: {
    title: string;
    details: string | null;
    defaultPrice: number | null;
  }) => Promise<LineItemCatalogItem>;
  onDeleteLineItemFromCatalog: (id: string) => Promise<void>;
  onLoadLineItemCatalogItems: () => Promise<LineItemCatalogItem[]>;
  onRequestDeleteLineItemFromSheet: () => void;
  showLineItemDeleteConfirm: boolean;
  lineItemDeleteDescription: string;
  onConfirmDeleteLineItem: () => void;
  onCancelDeleteLineItem: () => void;
  showLeaveWarning: boolean;
  onLeaveConfirm: () => void;
  onLeaveCancel: () => void;
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
  onSaveLineItemToCatalog,
  onDeleteLineItemFromCatalog,
  onLoadLineItemCatalogItems,
  onRequestDeleteLineItemFromSheet,
  showLineItemDeleteConfirm,
  lineItemDeleteDescription,
  onConfirmDeleteLineItem,
  onCancelDeleteLineItem,
  showLeaveWarning,
  onLeaveConfirm,
  onLeaveCancel,
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
          onSaveToCatalog={onSaveLineItemToCatalog}
          onDeleteFromCatalog={onDeleteLineItemFromCatalog}
          onLoadCatalogItems={onLoadLineItemCatalogItems}
          onRequestDelete={lineItemSheetState.mode === "edit" ? onRequestDeleteLineItemFromSheet : undefined}
        />
      ) : null}

      {showLineItemDeleteConfirm ? (
        <ConfirmModal
          title="Delete this line item?"
          body={`"${lineItemDeleteDescription}" will be removed from this draft.`}
          confirmLabel="Delete line item"
          cancelLabel="Keep line item"
          onConfirm={onConfirmDeleteLineItem}
          onCancel={onCancelDeleteLineItem}
          variant="destructive"
        />
      ) : null}

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
    </>
  );
}
