import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { DocumentSelectionFooter } from "@/features/quotes/components/DocumentSelectionFooter";

interface QuoteListSelectionOverlaysProps {
  isSelectionMode: boolean;
  selectedCount: number;
  isBulkActionPending: boolean;
  showArchiveConfirm: boolean;
  showDeleteConfirm: boolean;
  onCancelSelection: () => void;
  onArchiveSelection: () => void;
  onDeleteSelectionPermanently: () => void;
  onArchiveConfirmCancel: () => void;
  onDeleteConfirmCancel: () => void;
  onArchiveConfirm: () => void;
  onDeleteConfirm: () => void;
}

export function QuoteListSelectionOverlays({
  isSelectionMode,
  selectedCount,
  isBulkActionPending,
  showArchiveConfirm,
  showDeleteConfirm,
  onCancelSelection,
  onArchiveSelection,
  onDeleteSelectionPermanently,
  onArchiveConfirmCancel,
  onDeleteConfirmCancel,
  onArchiveConfirm,
  onDeleteConfirm,
}: QuoteListSelectionOverlaysProps): React.ReactElement {
  return (
    <>
      {isSelectionMode ? (
        <DocumentSelectionFooter
          selectedCount={selectedCount}
          onCancelSelection={onCancelSelection}
          onArchiveSelection={onArchiveSelection}
          onDeleteSelectionPermanently={onDeleteSelectionPermanently}
        />
      ) : null}
      {showArchiveConfirm ? (
        <ConfirmModal
          title={`Archive ${selectedCount} selected ${selectedCount === 1 ? "document" : "documents"}?`}
          body="Archived documents remain in history and can be restored later."
          confirmLabel="Archive"
          cancelLabel="Keep selected"
          confirmDisabled={isBulkActionPending || selectedCount === 0}
          onCancel={onArchiveConfirmCancel}
          onConfirm={onArchiveConfirm}
        />
      ) : null}
      {showDeleteConfirm ? (
        <ConfirmModal
          title={`Delete ${selectedCount} selected ${selectedCount === 1 ? "document" : "documents"} permanently?`}
          body="This action cannot be undone. Documents blocked by policy will stay untouched."
          confirmLabel="Delete permanently"
          cancelLabel="Keep selected"
          variant="destructive"
          confirmDisabled={isBulkActionPending || selectedCount === 0}
          onCancel={onDeleteConfirmCancel}
          onConfirm={onDeleteConfirm}
        />
      ) : null}
    </>
  );
}
