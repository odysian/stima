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
  onGeneratePdf: () => Promise<void>;
  onShare: () => Promise<void>;
  onCopyShareLink: () => Promise<void>;
  onMarkWon: () => Promise<void>;
  onRequestMarkLost: () => void;
  openPdfUrl: string | null;
  shareUrl: string | null;
  isGeneratingPdf: boolean;
  isSharing: boolean;
  isMarkingWon: boolean;
  isMarkingLost: boolean;
  disabled: boolean;
  pdfError: string | null;
  shareError: string | null;
  outcomeError: string | null;
  shareMessage: string | null;
}

export function QuotePreviewActions({
  actionState,
  onGeneratePdf,
  onShare,
  onCopyShareLink,
  onMarkWon,
  onRequestMarkLost,
  openPdfUrl,
  shareUrl,
  isGeneratingPdf,
  isSharing,
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
  } else if (isSharing) {
    statusCopy = "Preparing share link...";
  } else if (isMarkingWon) {
    statusCopy = "Recording quote as won...";
  } else if (isMarkingLost) {
    statusCopy = "Recording quote as lost...";
  }
  const primaryLinkClasses = "inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-4 text-center font-semibold text-white transition-all active:scale-[0.98] forest-gradient";
  const secondaryLinkClasses = "inline-flex w-full items-center justify-center gap-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-4 py-4 text-center font-semibold text-on-surface transition-all active:scale-[0.98]";
  const secondaryButtonClasses = "w-full rounded-lg border border-outline-variant/30 bg-surface-container-lowest py-4 font-semibold text-on-surface-variant transition-all disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]";
  const isOutcomeInFlight = isMarkingWon || isMarkingLost;
  const openPdfHref = openPdfUrl ?? shareUrl;

  function renderOpenPdfAction(asPrimary: boolean): React.ReactElement {
    const className = asPrimary ? primaryLinkClasses : secondaryLinkClasses;

    if (openPdfHref) {
      return (
        <a
          href={openPdfHref}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
        >
          <span className="material-symbols-outlined text-base">open_in_new</span>
          Open PDF
        </a>
      );
    }

    return (
      <button
        type="button"
        className={`${className} disabled:cursor-not-allowed disabled:opacity-40`}
        disabled
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

        {actionState === "ready" ? (
          <>
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                void onShare();
              }}
              isLoading={isSharing}
              disabled={disabled}
            >
              Share Quote
            </Button>
            {renderOpenPdfAction(false)}
          </>
        ) : null}

        {actionState === "shared" || actionState === "viewed" ? (
          <>
            {renderOpenPdfAction(true)}
            <button
              type="button"
              onClick={() => {
                void onCopyShareLink();
              }}
              className={secondaryButtonClasses}
              disabled={!shareUrl || disabled || isOutcomeInFlight}
            >
              Copy Share Link
            </button>
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                void onMarkWon();
              }}
              isLoading={isMarkingWon}
              disabled={disabled || isMarkingLost}
            >
              Mark as Won
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              onClick={onRequestMarkLost}
              disabled={disabled || isOutcomeInFlight}
            >
              Mark as Lost
            </Button>
          </>
        ) : null}

        {actionState === "approved" || actionState === "declined" ? (
          <>
            {renderOpenPdfAction(true)}
          </>
        ) : null}
      </div>

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
