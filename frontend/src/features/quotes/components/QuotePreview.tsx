import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { quoteService } from "@/features/quotes/services/quoteService";
import type { Quote } from "@/features/quotes/types/quote.types";
import { Button } from "@/shared/components/Button";
import { BottomNav } from "@/shared/components/BottomNav";
import { StatusBadge } from "@/shared/components/StatusBadge";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function isShareAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

function readOptionalQuoteText(
  quote: Quote | null,
  key: "customer_name" | "customer_email" | "customer_phone",
): string | null {
  if (!quote) {
    return null;
  }

  const value = quote[key];
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

export function QuotePreview(): React.ReactElement {
  const navigate = useNavigate();
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

  const canShare = quote !== null && pdfUrl !== null;
  const shareUrl = quote?.share_token
    ? `${window.location.origin}/share/${quote.share_token}`
    : null;
  const clientName = readOptionalQuoteText(quote, "customer_name") || quote?.customer_id || "Unknown customer";
  const clientContact =
    [readOptionalQuoteText(quote, "customer_email"), readOptionalQuoteText(quote, "customer_phone")]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .join(" \u00b7 ") || "No contact details";

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

  async function copyToClipboard(): Promise<void> {
    if (!shareUrl) {
      return;
    }

    setShareError(null);
    setShareMessage(null);

    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
      setShareMessage("Copy this share link manually.");
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareMessage("Share link copied to clipboard.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to copy share link";
      setShareError(message);
    }
  }

  return (
    <main className="min-h-screen bg-background pb-24 pt-16">
      <header className="fixed top-0 z-50 flex h-16 w-full items-center gap-3 bg-white/80 px-4 shadow-[0_0_24px_rgba(13,28,46,0.04)] backdrop-blur-md">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-full p-2 text-emerald-900 transition-all hover:bg-slate-50 active:scale-95"
          aria-label="Back"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="font-headline text-lg font-bold tracking-tight text-on-surface">
          {quote?.doc_number ?? "Quote Preview"}
        </h1>
        {quote ? <StatusBadge variant={quote.status} /> : null}
      </header>

      <section className="mx-auto w-full max-w-6xl">
        {isLoadingQuote ? (
          <p role="status" className="mt-4 px-4 text-sm text-on-surface-variant">
            Loading quote...
          </p>
        ) : null}

        {loadError ? (
          <p role="alert" className="mx-4 mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {loadError}
          </p>
        ) : null}

        {!isLoadingQuote && !loadError ? (
          <>
            <div className="mx-4 mt-4 overflow-hidden rounded-xl bg-surface-container-low" style={{ height: "55vh" }}>
              {pdfUrl ? (
                <iframe src={pdfUrl} className="h-full w-full border-0" title="Quote PDF preview" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3">
                  <span className="material-symbols-outlined text-5xl text-outline">description</span>
                  <p className="text-sm text-outline">Generate the PDF to preview it here.</p>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-3 px-4">
              <Button
                type="button"
                className="w-full"
                onClick={() => {
                  void onGeneratePdf();
                }}
                isLoading={isGeneratingPdf}
                disabled={isLoadingQuote || !!loadError}
              >
                Generate PDF
              </Button>
              <button
                type="button"
                onClick={() => {
                  void onShare();
                }}
                className="w-full rounded-lg border border-primary py-4 font-semibold text-primary transition-all disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
                disabled={!canShare || isLoadingQuote || !!loadError || isSharing}
              >
                {isSharing ? "Sharing..." : "Share"}
              </button>
            </div>

            {shareUrl ? (
              <div className="mx-4 mt-4 flex items-center gap-3 rounded-lg bg-surface-container-low p-3">
                <span className="flex-1 truncate text-sm text-on-surface-variant">{shareUrl}</span>
                <button
                  type="button"
                  className="rounded-lg p-2 transition-all hover:bg-surface-container active:scale-95"
                  onClick={() => {
                    void copyToClipboard();
                  }}
                  aria-label="Copy share link"
                >
                  <span className="material-symbols-outlined text-primary">content_copy</span>
                </button>
              </div>
            ) : null}

            {isGeneratingPdf ? (
              <p role="status" className="mx-4 mt-3 text-sm text-on-surface-variant">
                Generating PDF...
              </p>
            ) : null}

            {pdfError ? (
              <p role="alert" className="mx-4 mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
                {pdfError}
              </p>
            ) : null}

            {shareError ? (
              <p role="alert" className="mx-4 mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
                {shareError}
              </p>
            ) : null}

            {shareMessage ? (
              <p className="mx-4 mt-3 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{shareMessage}</p>
            ) : null}

            {quote ? (
              <div className="mt-4 flex flex-col gap-3 px-4 pb-6">
                <section className="ghost-shadow rounded-lg border-l-4 border-primary bg-surface-container-lowest p-4">
                  <h2 className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                    TOTAL AMOUNT
                  </h2>
                  <p className="mt-2 font-headline text-2xl font-bold text-primary">
                    {quote.total_amount === null ? "\u2014" : currencyFormatter.format(quote.total_amount)}
                  </p>
                </section>

                <section className="ghost-shadow rounded-lg border-l-4 border-teal-500 bg-surface-container-lowest p-4">
                  {/* Using border-teal-500 to match Stitch's client accent; it's visually aligned with the surface-tint token. */}
                  <h2 className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">CLIENT</h2>
                  <p className="mt-2 font-bold text-on-surface">{clientName}</p>
                  <p className="mt-1 text-sm text-on-surface-variant">{clientContact}</p>
                </section>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      <BottomNav active="quotes" />
    </main>
  );
}
