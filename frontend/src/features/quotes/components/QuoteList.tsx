import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteListItem, QuoteStatus } from "@/features/quotes/types/quote.types";
import { Button } from "@/shared/components/Button";
import { Input } from "@/shared/components/Input";

const STATUS_BADGE_CLASSES: Record<QuoteStatus, string> = {
  draft: "bg-slate-200 text-slate-800",
  ready: "bg-emerald-100 text-emerald-800",
  shared: "bg-sky-100 text-sky-800",
};

function formatTotalAmount(totalAmount: number | null): string {
  if (totalAmount === null) {
    return "";
  }

  return totalAmount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCreatedDate(value: string): string {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return "Unknown date";
  }

  return parsedDate.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function QuoteList(): React.ReactElement {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<QuoteListItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function fetchQuotes(): Promise<void> {
      setIsLoading(true);
      setLoadError(null);
      try {
        const nextQuotes = await quoteService.listQuotes();
        if (isActive) {
          setQuotes(nextQuotes);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load quotes";
        if (isActive) {
          setLoadError(message);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void fetchQuotes();

    return () => {
      isActive = false;
    };
  }, []);

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const filteredQuotes = useMemo(() => {
    if (!normalizedSearchTerm) {
      return quotes;
    }

    return quotes.filter((quote) => {
      const customerName = quote.customer_name.toLowerCase();
      const docNumber = quote.doc_number.toLowerCase();
      return (
        customerName.includes(normalizedSearchTerm) ||
        docNumber.includes(normalizedSearchTerm)
      );
    });
  }, [normalizedSearchTerm, quotes]);

  return (
    <main className="min-h-screen bg-slate-100 pb-24">
      <section className="mx-auto w-full max-w-6xl px-4 py-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Your Quotes</h1>
            <p className="mt-2 text-sm text-slate-600">
              Search and open any quote to generate or share a PDF.
            </p>
          </div>
          <Button type="button" onClick={() => navigate("/settings")}>
            Settings
          </Button>
        </header>

        <div className="mt-6 w-full max-w-md">
          <Input
            label="Search quotes"
            id="quote-search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        {isLoading ? (
          <p role="status" className="mt-6 text-sm text-slate-700">
            Loading quotes...
          </p>
        ) : null}

        {loadError ? (
          <p role="alert" className="mt-6 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {loadError}
          </p>
        ) : null}

        {!isLoading && !loadError && filteredQuotes.length === 0 ? (
          <section className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-6">
            <p className="text-base font-medium text-slate-900">
              {quotes.length === 0 ? "No quotes yet" : "No quotes match your search"}
            </p>
            {quotes.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">
                Create your first one to get started.
              </p>
            ) : null}
            {quotes.length === 0 ? (
              <div className="mt-4">
                <Button type="button" onClick={() => navigate("/quotes/new")}>
                  Create your first quote
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}

        {!isLoading && !loadError && filteredQuotes.length > 0 ? (
          <ul className="mt-6 space-y-3">
            {filteredQuotes.map((quote) => (
              <li key={quote.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/quotes/${quote.id}/preview`)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-slate-900">
                        {quote.customer_name}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">{quote.doc_number}</p>
                    </div>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_BADGE_CLASSES[quote.status]}`}
                    >
                      {quote.status}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                    <p>
                      <span className="text-slate-500">Created: </span>
                      {formatCreatedDate(quote.created_at)}
                    </p>
                    <p>
                      <span className="text-slate-500">Total: </span>
                      {formatTotalAmount(quote.total_amount)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div className="fixed bottom-6 right-6 z-10">
        <Button type="button" onClick={() => navigate("/quotes/new")}>
          New Quote
        </Button>
      </div>
    </main>
  );
}
