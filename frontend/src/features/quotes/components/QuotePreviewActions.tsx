import { Button } from "@/shared/components/Button";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";

interface QuotePreviewActionsProps {
  emailActionLabel: string | null;
  hasCustomerEmail: boolean;
  onGeneratePdf: () => Promise<void>;
  onRequestSendEmail: () => void;
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
const primaryLinkClasses = "forest-gradient inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-4 text-center font-semibold text-on-primary transition-all active:scale-[0.98]";

export function QuotePreviewActions({
  emailActionLabel,
  hasCustomerEmail,
  onGeneratePdf,
  onRequestSendEmail,
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
  const showUtilities = showEmailAction || Boolean(openPdfHref);
  const canCopyLink = !disabled;
  const utilityGridClassName = "grid grid-cols-2 gap-2";

  function renderOpenPdfAction(): React.ReactElement {
    if (openPdfHref) {
      return (
        <a
          href={openPdfHref}
          target="_blank"
          rel="noopener noreferrer"
          className={primaryLinkClasses}
        >
          <span className="material-symbols-outlined text-base">open_in_new</span>
          Open PDF
        </a>
      );
    }

    return (
      <button
        type="button"
        className={secondaryButtonClasses}
        disabled={
          disabled
          || isGeneratingPdf
          || isSendingEmail
          || isCopyingLink
          || isMarkingWon
          || isMarkingLost
        }
        onClick={() => {
          void onGeneratePdf();
        }}
      >
        <span className="material-symbols-outlined text-base">picture_as_pdf</span>
        Generate PDF
      </button>
    );
  }

  return (
    <>
      <section className="mt-4 px-4" aria-label="Quote actions">
        <div className="ghost-shadow rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4">
          {renderOpenPdfAction()}

          {showUtilities ? (
            <div role="group" aria-label="Quote utilities" className={`mt-3 ${utilityGridClassName}`}>
              {showEmailAction ? (
                <button
                  type="button"
                  className={secondaryButtonClasses}
                  disabled={
                    disabled
                    || !hasCustomerEmail
                    || isGeneratingPdf
                    || isSendingEmail
                    || isCopyingLink
                    || isMarkingWon
                    || isMarkingLost
                  }
                  onClick={onRequestSendEmail}
                >
                  <span className="material-symbols-outlined text-base">mail</span>
                  {isSendingEmail ? "Sending..." : emailActionLabel}
                </button>
              ) : null}

              <button
                type="button"
                className={secondaryButtonClasses}
                disabled={
                  disabled
                  || !canCopyLink
                  || isGeneratingPdf
                  || isSendingEmail
                  || isCopyingLink
                  || isMarkingWon
                  || isMarkingLost
                }
                onClick={() => {
                  void onCopyLink();
                }}
              >
                <span className="material-symbols-outlined text-base">content_copy</span>
                Copy Link
              </button>
            </div>
          ) : null}
        </div>
      </section>

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
