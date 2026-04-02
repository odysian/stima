import type { ReactNode } from "react";

import { ConfirmModal } from "@/shared/components/ConfirmModal";

interface QuotePreviewDialogsProps {
  quoteLabel: string;
  emailActionLabel: string | null;
  customerEmail: string | null;
  showDeleteConfirm: boolean;
  showMarkWonConfirm: boolean;
  showMarkLostConfirm: boolean;
  showSendEmailConfirm: boolean;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
  onMarkWonConfirm: () => void;
  onMarkWonCancel: () => void;
  onMarkLostConfirm: () => void;
  onMarkLostCancel: () => void;
  onSendEmailConfirm: () => void;
  onSendEmailCancel: () => void;
}

export function QuotePreviewDialogs({
  quoteLabel,
  emailActionLabel,
  customerEmail,
  showDeleteConfirm,
  showMarkWonConfirm,
  showMarkLostConfirm,
  showSendEmailConfirm,
  onDeleteConfirm,
  onDeleteCancel,
  onMarkWonConfirm,
  onMarkWonCancel,
  onMarkLostConfirm,
  onMarkLostCancel,
  onSendEmailConfirm,
  onSendEmailCancel,
}: QuotePreviewDialogsProps): React.ReactElement {
  const sendEmailBody: ReactNode = customerEmail ? (
    <>
      This sends the latest quote to{" "}
      <span className="break-all font-medium text-on-surface">{customerEmail}</span>.
    </>
  ) : "This sends the latest quote to the customer email on file.";

  return (
    <>
      {showDeleteConfirm ? (
        <ConfirmModal
          title={`Delete ${quoteLabel}?`}
          body="This cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Keep"
          variant="destructive"
          onConfirm={onDeleteConfirm}
          onCancel={onDeleteCancel}
        />
      ) : null}

      {showMarkWonConfirm ? (
        <ConfirmModal
          title="Mark quote as won?"
          body="This records the quote as won. You can still view the quote and its PDF."
          confirmLabel="Mark as Won"
          cancelLabel="Cancel"
          onConfirm={onMarkWonConfirm}
          onCancel={onMarkWonCancel}
        />
      ) : null}

      {showMarkLostConfirm ? (
        <ConfirmModal
          title="Mark quote as lost?"
          body="This records the quote as lost. You can still view the quote and its PDF."
          confirmLabel="Mark as Lost"
          cancelLabel="Cancel"
          variant="destructive"
          onConfirm={onMarkLostConfirm}
          onCancel={onMarkLostCancel}
        />
      ) : null}

      {showSendEmailConfirm && emailActionLabel ? (
        <ConfirmModal
          title={`${emailActionLabel}?`}
          body={sendEmailBody}
          confirmLabel={emailActionLabel}
          cancelLabel="Cancel"
          onConfirm={onSendEmailConfirm}
          onCancel={onSendEmailCancel}
        />
      ) : null}
    </>
  );
}
