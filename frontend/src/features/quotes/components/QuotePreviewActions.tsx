import { Button } from "@/shared/components/Button";
import {
  DocumentActionError,
  DocumentActionHint,
  DocumentActionManualCopyField,
  DocumentActionStatus,
  DocumentActionSurface,
  documentActionPrimaryLinkClassName,
} from "@/shared/components/DocumentActionSurface";
import { AppIcon } from "@/ui/Icon";

interface QuotePreviewActionsProps {
  emailActionLabel: string | null;
  hasCustomerEmail: boolean;
  onGeneratePdf: () => Promise<void>;
  onRequestSendEmail: () => void;
  onCopyLink: () => Promise<void>;
  openPdfUrl: string | null;
  shareUrl: string | null;
  manualCopyUrl: string | null;
  isGeneratingPdf: boolean;
  isSendingEmail: boolean;
  isCopyingLink: boolean;
  isMarkingWon: boolean;
  isMarkingLost: boolean;
  disabled: boolean;
  pdfError: string | null;
  shareError: string | null;
  outcomeError: string | null;
}

export function QuotePreviewActions({
  emailActionLabel,
  hasCustomerEmail,
  onGeneratePdf,
  onRequestSendEmail,
  onCopyLink,
  openPdfUrl,
  shareUrl,
  manualCopyUrl,
  isGeneratingPdf,
  isSendingEmail,
  isCopyingLink,
  isMarkingWon,
  isMarkingLost,
  disabled,
  pdfError,
  shareError,
  outcomeError,
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

  const openPdfHref = openPdfUrl;
  const showEmailAction = emailActionLabel !== null;
  const showUtilities = showEmailAction || Boolean(openPdfHref);

  function renderOpenPdfAction(): React.ReactElement {
    if (openPdfHref) {
      return (
        <a
          href={openPdfHref}
          target="_blank"
          rel="noopener noreferrer"
          className={documentActionPrimaryLinkClassName}
        >
          <AppIcon name="open_in_new" className="text-base leading-none" />
          Open PDF
        </a>
      );
    }

    return (
      <Button
        type="button"
        variant="primary"
        size="lg"
        className="w-full"
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
        leadingIcon={<AppIcon name="picture_as_pdf" className="text-base leading-none" />}
      >
        Generate PDF
      </Button>
    );
  }

  return (
    <DocumentActionSurface
      sectionLabel="Quote actions"
      primaryAction={renderOpenPdfAction()}
      utilityActions={showUtilities ? (
        <>
          {showEmailAction ? (
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="w-full"
              disabled={
                disabled
                || !hasCustomerEmail
                || isGeneratingPdf
                || isSendingEmail
                || isCopyingLink
                || isMarkingWon
                || isMarkingLost
              }
              isLoading={isSendingEmail}
              leadingIcon={<AppIcon name="mail" className="text-base leading-none" />}
              onClick={onRequestSendEmail}
            >
              {emailActionLabel}
            </Button>
          ) : null}

          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            disabled={
              disabled
              || isGeneratingPdf
              || isSendingEmail
              || isCopyingLink
              || isMarkingWon
              || isMarkingLost
            }
            leadingIcon={<AppIcon name="content_copy" className="text-base leading-none" />}
            onClick={() => {
              void onCopyLink();
            }}
          >
            Copy Link
          </Button>
        </>
      ) : null}
      utilityLabel={showUtilities ? "Quote utilities" : undefined}
      hint={!hasCustomerEmail && showEmailAction ? (
        <DocumentActionHint>
          Add a customer email to send this quote via email. Copy Link still works.
        </DocumentActionHint>
      ) : null}
      status={statusCopy ? <DocumentActionStatus>{statusCopy}</DocumentActionStatus> : null}
      feedback={(
        <>
          {pdfError ? <DocumentActionError>{pdfError}</DocumentActionError> : null}
          {shareError ? <DocumentActionError>{shareError}</DocumentActionError> : null}
          {outcomeError ? <DocumentActionError>{outcomeError}</DocumentActionError> : null}
          {manualCopyUrl ? (
            <>
              <DocumentActionHint>Copy this share link manually.</DocumentActionHint>
              <DocumentActionManualCopyField
                url={manualCopyUrl}
                label={shareUrl ? "Share URL" : "Generated share URL"}
              />
            </>
          ) : null}
        </>
      )}
    />
  );
}
