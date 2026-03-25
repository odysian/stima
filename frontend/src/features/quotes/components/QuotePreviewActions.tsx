import { Button } from "@/shared/components/Button";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";

interface QuotePreviewActionsProps {
  onGeneratePdf: () => Promise<void>;
  onShare: () => Promise<void>;
  isGeneratingPdf: boolean;
  isSharing: boolean;
  canShare: boolean;
  disabled: boolean;
  pdfError: string | null;
  shareError: string | null;
  shareMessage: string | null;
}

export function QuotePreviewActions({
  onGeneratePdf,
  onShare,
  isGeneratingPdf,
  isSharing,
  canShare,
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

  return (
    <>
      <div className="mt-4 flex flex-col gap-3 px-4">
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
        <button
          type="button"
          onClick={() => {
            void onShare();
          }}
          className="w-full rounded-lg border border-primary py-4 font-semibold text-primary transition-all disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
          disabled={!canShare || disabled || isSharing}
        >
          {isSharing ? "Sharing..." : "Share"}
        </button>
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
