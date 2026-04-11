import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { Input } from "@/shared/components/Input";

interface CustomerDeleteConfirmModalProps {
  customerName: string;
  quoteCount: number;
  invoiceCount: number;
  confirmationName: string;
  deleteError: string | null;
  isDeleting: boolean;
  confirmationMatches: boolean;
  onConfirmationChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CustomerDeleteConfirmModal({
  customerName,
  quoteCount,
  invoiceCount,
  confirmationName,
  deleteError,
  isDeleting,
  confirmationMatches,
  onConfirmationChange,
  onConfirm,
  onCancel,
}: CustomerDeleteConfirmModalProps): React.ReactElement {
  return (
    <ConfirmModal
      title="Delete customer?"
      body={(
        <div className="space-y-3">
          <p>
            <span className="font-semibold text-on-surface">{customerName}</span> has {quoteCount}{" "}
            {quoteCount === 1 ? "quote" : "quotes"} and {invoiceCount}{" "}
            {invoiceCount === 1 ? "invoice" : "invoices"}.
          </p>
          <p className="font-semibold text-error">This cannot be undone.</p>
          <Input
            id="delete-customer-confirmation"
            label={`Type ${customerName} to confirm`}
            value={confirmationName}
            onChange={(event) => onConfirmationChange(event.target.value)}
          />
          {deleteError ? <FeedbackMessage variant="error">{deleteError}</FeedbackMessage> : null}
        </div>
      )}
      confirmLabel={isDeleting ? "Deleting..." : "Delete Customer"}
      cancelLabel="Cancel"
      onConfirm={onConfirm}
      onCancel={onCancel}
      confirmDisabled={!confirmationMatches || isDeleting}
      variant="destructive"
    />
  );
}
