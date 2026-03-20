import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { quoteService } from "@/features/quotes/services/quoteService";
import type { Quote } from "@/features/quotes/types/quote.types";
import { Button } from "@/shared/components/Button";

function isShareAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

export function QuotePreview(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharedUrl, setSharedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoadError("Missing quote id.");
      setIsLoadingQuote(false);
      return;
    }
    const quoteId = id;

    let isActive = true;

    async function fetchQuote(): Promise<void> {
      setIsLoadingQuote(true);
      setLoadError(null);
      try {
        const fetchedQuote = await quoteService.getQuote(quoteId);
        if (isActive) {
          setQuote(fetchedQuote);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load quote";
        if (isActive) {
          setLoadError(message);
        }
      } finally {
        if (isActive) {
          setIsLoadingQuote(false);
        }
      }
    }

    void fetchQuote();

    return () => {
      isActive = false;
    };
  }, [id]);

  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  const canShare = quote !== null && (quote.status !== "draft" || pdfUrl !== null);

  async function onGeneratePdf(): Promise<void> {
    if (!id) {
      return;
    }

    setPdfError(null);
    setShareError(null);
    setShareMessage(null);
    setIsGeneratingPdf(true);
    try {
      const blob = await quoteService.generatePdf(id);
      const nextPdfUrl = URL.createObjectURL(blob);

      setPdfUrl((currentPdfUrl) => {
        if (currentPdfUrl) {
          URL.revokeObjectURL(currentPdfUrl);
        }
        return nextPdfUrl;
      });
      setQuote((currentQuote) => {
        if (!currentQuote || currentQuote.status === "shared") {
          return currentQuote;
        }
        return { ...currentQuote, status: "ready" };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to generate PDF";
      setPdfError(message);
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  async function onShare(): Promise<void> {
    if (!id || !quote) {
      return;
    }

    setShareError(null);
    setShareMessage(null);
    setIsSharing(true);

    try {
      const updatedQuote = await quoteService.shareQuote(id);
      setQuote(updatedQuote);

      if (!updatedQuote.share_token) {
        throw new Error("Share link unavailable");
      }

      const nextSharedUrl = `${window.location.origin}/share/${updatedQuote.share_token}`;
      setSharedUrl(nextSharedUrl);

      const maybeNavigator = navigator as Navigator & {
        share?: (data: ShareData) => Promise<void>;
      };

      if (typeof maybeNavigator.share === "function") {
        await maybeNavigator.share({
          title: `Quote ${updatedQuote.doc_number}`,
          url: nextSharedUrl,
        });
        setShareMessage("Quote link shared.");
        return;
      }

      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(nextSharedUrl);
        setShareMessage("Share link copied to clipboard.");
        return;
      }

      setShareMessage("Share this link with your customer.");
    } catch (error) {
      if (isShareAbortError(error)) {
        return;
      }
      const message = error instanceof Error ? error.message : "Unable to share quote";
      setShareError(message);
    } finally {
      setIsSharing(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8">
      <section className="mx-auto w-full max-w-6xl rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Quote Preview</h1>

        {isLoadingQuote ? (
          <p role="status" className="mt-4 text-sm text-slate-700">
            Loading quote...
          </p>
        ) : null}

        {loadError ? (
          <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {loadError}
          </p>
        ) : null}

        {quote ? (
          <p className="mt-2 text-sm text-slate-600">
            {quote.doc_number} • Status: <span className="font-medium">{quote.status}</span>
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => {
              void onGeneratePdf();
            }}
            isLoading={isGeneratingPdf}
            disabled={isLoadingQuote || !!loadError}
          >
            Generate PDF
          </Button>
          <Button
            type="button"
            onClick={() => {
              void onShare();
            }}
            isLoading={isSharing}
            disabled={!canShare || isLoadingQuote || !!loadError}
          >
            Share
          </Button>
        </div>

        {isGeneratingPdf ? (
          <p role="status" className="mt-3 text-sm text-slate-700">
            Generating PDF...
          </p>
        ) : null}

        {pdfError ? (
          <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {pdfError}
          </p>
        ) : null}

        {shareError ? (
          <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {shareError}
          </p>
        ) : null}

        {shareMessage ? (
          <p className="mt-3 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{shareMessage}</p>
        ) : null}

        {sharedUrl ? (
          <p className="mt-2 text-sm text-slate-700">
            Share URL:{" "}
            <a href={sharedUrl} className="font-medium text-slate-900 underline">
              {sharedUrl}
            </a>
          </p>
        ) : null}

        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {pdfUrl ? (
            <iframe
              title="Quote PDF Preview"
              src={pdfUrl}
              className="h-[70vh] w-full border-0"
            />
          ) : (
            <div className="flex h-80 items-center justify-center px-4 text-center text-sm text-slate-600">
              Generate the PDF to preview it here.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
