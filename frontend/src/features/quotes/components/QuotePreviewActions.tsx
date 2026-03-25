import { Button } from "@/shared/components/Button";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";

type QuotePreviewActionState = "draft" | "ready" | "shared";

interface QuotePreviewActionsProps {
  actionState: QuotePreviewActionState;
  onGeneratePdf: () => Promise<void>;
  onShare: () => Promise<void>;
  onCopyShareLink: () => Promise<void>;
  openPdfUrl: string | null;
  shareUrl: string | null;
  isGeneratingPdf: boolean;
  isSharing: boolean;
  disabled: boolean;
  pdfError: string | null;
  shareError: string | null;
  shareMessage: string | null;
}

export function QuotePreviewActions({
  actionState,
  onGeneratePdf,
  onShare,
  onCopyShareLink,
  openPdfUrl,
  shareUrl,
  isGeneratingPdf,
  isSharing,
  disabled,
  pdfError,
  shareError,
  shareMessage,
}: QuotePreviewActionsProps): React.ReactElement {
  const statusCopy = isGeneratingPdf
    ? "Generating PDF preview. This can take a few moments."
    : isSharing
      ? "Preparing share link..."
      : null;
  const primaryLinkClasses = "inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-4 text-center font-semibold text-white transition-all active:scale-[0.98] forest-gradient";
  const secondaryLinkClasses = "inline-flex w-full items-center justify-center gap-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-4 py-4 text-center font-semibold text-on-surface transition-all active:scale-[0.98]";
  const secondaryButtonClasses = "w-full rounded-lg border border-outline-variant/30 bg-surface-container-lowest py-4 font-semibold text-on-surface-variant transition-all disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]";

  function renderOpenPdfAction(asPrimary: boolean): React.ReactElement {
    const className = asPrimary ? primaryLinkClasses : secondaryLinkClasses;

    if (openPdfUrl) {
      return (
        <a
          href={openPdfUrl}
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

        {actionState === "shared" ? (
          <>
            {renderOpenPdfAction(true)}
            <button
              type="button"
              onClick={() => {
                void onCopyShareLink();
              }}
              className={secondaryButtonClasses}
              disabled={!shareUrl || disabled}
            >
              Copy Share Link
            </button>
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

      {shareMessage ? (
        <p className="mx-4 mt-3 rounded-md bg-success-container p-3 text-sm text-success">{shareMessage}</p>
      ) : null}
    </>
  );
}
