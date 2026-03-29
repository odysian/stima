import { Button } from "@/shared/components/Button";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";

type QuotePreviewActionState =
  | "draft"
  | "ready"
  | "shared"
  | "viewed"
  | "approved"
  | "declined";

interface QuotePreviewActionsProps {
  actionState: QuotePreviewActionState;
  emailActionLabel: string | null;
  hasCustomerEmail: boolean;
  onGeneratePdf: () => Promise<void>;
  onSendEmail: () => Promise<void>;
  onCopyLink: () => Promise<void>;
  openPdfUrl: string | null;
  shareUrl: string | null;
  isGeneratingPdf: boolean;
  isSendingEmail: boolean;
  isCopyingLink: boolean;
  isMarkingWon: boolean;
  isMarkingLost: boolean;
  disabled: boolean;
  pdfError: string | null;
  shareError: string | null;
  outcomeError: string | null;
  shareMessage: string | null;
}

const secondaryButtonClasses = "inline-flex w-full items-center justify-center gap-2 rounded-lg border border-outline px-4 py-4 text-center font-semibold text-on-surface transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40";
const utilityButtonClasses = "inline-flex w-full items-center justify-center gap-2 rounded-lg bg-surface-container px-4 py-4 text-center font-medium text-on-surface transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40";

export function QuotePreviewActions({
  actionState,
  emailActionLabel,
  hasCustomerEmail,
  onGeneratePdf,
  onSendEmail,
  onCopyLink,
  openPdfUrl,
  shareUrl,
  isGeneratingPdf,
  isSendingEmail,
  isCopyingLink,
  isMarkingWon,
  isMarkingLost,
  disabled,
  pdfError,
  shareError,
  outcomeError,
  shareMessage,
}: QuotePreviewActionsProps): React.ReactElement {
  let statusCopy: string | null = null;
  if (isGeneratingPdf) {
    statusCopy = "Generating PDF preview. This can take a few moments.";
  } else if (isSendingEmail) {
    statusCopy = "Sending quote email...";
  } else if (isCopyingLink) {
    statusCopy = "Copying share link...";
  } else if (isMarkingWon) {
    statusCopy = "Recording quote as won...";
  } else if (isMarkingLost) {
    statusCopy = "Recording quote as lost...";
  }

  const openPdfHref = openPdfUrl ?? shareUrl;
  const showEmailAction = emailActionLabel !== null;
  const canCopyLink = actionState === "ready" || Boolean(shareUrl);

  function renderOpenPdfAction(): React.ReactElement {
    if (openPdfHref) {
      return (
        <a
          href={openPdfHref}
          target="_blank"
          rel="noopener noreferrer"
          className={utilityButtonClasses}
        >
          <span className="material-symbols-outlined text-base">open_in_new</span>
          Open PDF
        </a>
      );
    }

    return (
      <button
        type="button"
        className={utilityButtonClasses}
        disabled={disabled || actionState !== "ready"}
        onClick={() => {
          void onGeneratePdf();
        }}
      >
        <span className="material-symbols-outlined text-base">open_in_new</span>
        Open PDF
      </button>
    );
  }

  return (
    <>
      <div className="mt-4 flex flex-col gap-3 px-4">
        {actionState === "draft" ? (
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              void onGeneratePdf();
            }}
            isLoading={isGeneratingPdf}
            disabled={disabled}
          >
            Generate PDF
          </Button>
        ) : null}

        {showEmailAction ? (
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              void onSendEmail();
            }}
            isLoading={isSendingEmail}
            disabled={disabled || !hasCustomerEmail || isCopyingLink}
          >
            {emailActionLabel}
          </Button>
        ) : null}

        {actionState !== "draft" ? (
          <button
            type="button"
            className={secondaryButtonClasses}
            disabled={disabled || !canCopyLink || isSendingEmail || isCopyingLink}
            onClick={() => {
              void onCopyLink();
            }}
          >
            <span className="material-symbols-outlined text-base">content_copy</span>
            Copy Link
          </button>
        ) : null}

        {actionState !== "draft" ? <>{renderOpenPdfAction()}</> : null}
      </div>

      {!hasCustomerEmail && showEmailAction ? (
        <p className="mx-4 mt-3 text-sm text-on-surface-variant">
          Add a customer email to send this quote by email. Copy Link still works.
        </p>
      ) : null}

      {statusCopy ? (
        <p role="status" className="mx-4 mt-3 text-sm text-on-surface-variant">
          {statusCopy}
        </p>
      ) : null}

      {pdfError ? (
        <div className="mx-4 mt-3">
          <FeedbackMessage variant="error">{pdfError}</FeedbackMessage>
        </div>
      ) : null}

      {shareError ? (
        <div className="mx-4 mt-3">
          <FeedbackMessage variant="error">{shareError}</FeedbackMessage>
        </div>
      ) : null}

      {outcomeError ? (
        <div className="mx-4 mt-3">
          <FeedbackMessage variant="error">{outcomeError}</FeedbackMessage>
        </div>
      ) : null}

      {shareMessage ? (
        <p className="mx-4 mt-3 rounded-md bg-success-container p-3 text-sm text-success">{shareMessage}</p>
      ) : null}
    </>
  );
}
