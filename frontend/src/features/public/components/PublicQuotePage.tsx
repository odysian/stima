import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import {
  PublicRequestError,
  publicService,
} from "@/features/public/services/publicService";
import type { PublicQuote } from "@/features/public/types/public.types";
import { PricingRow } from "@/shared/components/PricingRow";
import { formatCurrency } from "@/shared/lib/formatters";
import { calculatePricingFromPersisted, resolveLineItemSum } from "@/shared/lib/pricing";

type LoadState = "loading" | "ready" | "invalid" | "error";

const statusCopy = {
  approved: {
    title: "This quote has been accepted",
    className: "border border-success/20 bg-success-container text-success",
  },
  declined: {
    title: "This quote is no longer available",
    className: "border border-warning/20 bg-warning-container text-warning",
  },
} as const;

function getDisplayTitle(quote: PublicQuote | null): string {
  if (!quote) {
    return "Shared Quote";
  }
  return quote.title?.trim() || quote.doc_number;
}

function getDisplayBusinessName(quote: PublicQuote | null): string {
  if (!quote) {
    return "Stima";
  }
  return quote.business_name?.trim() || "Stima";
}

export function PublicQuotePage(): React.ReactElement {
  const { token } = useParams<{ token: string }>();
  const hasToken = typeof token === "string" && token.length > 0;
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [hiddenLogoUrl, setHiddenLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    const previousTitle = document.title;
    const existingMeta = document.querySelector('meta[name="robots"]');
    const meta = existingMeta ?? document.createElement("meta");
    const previousContent = existingMeta ? existingMeta.getAttribute("content") : null;

    if (!existingMeta) {
      meta.setAttribute("name", "robots");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", "noindex");

    return () => {
      document.title = previousTitle;
      if (!existingMeta) {
        meta.remove();
        return;
      }
      if (previousContent === null) {
        meta.removeAttribute("content");
        return;
      }
      meta.setAttribute("content", previousContent);
    };
  }, []);

  useEffect(() => {
    if (!hasToken || loadState === "invalid") {
      document.title = "Shared Quote Unavailable";
      return;
    }
    if (loadState === "error") {
      document.title = "Shared Quote";
      return;
    }
    document.title = `${getDisplayTitle(quote)} | ${getDisplayBusinessName(quote)}`;
  }, [hasToken, loadState, quote]);

  useEffect(() => {
    if (!hasToken) {
      return;
    }
    const shareToken = token ?? "";

    let isActive = true;

    async function loadQuote(): Promise<void> {
      setLoadState("loading");
      try {
        const nextQuote = await publicService.getQuote(shareToken);
        if (!isActive) {
          return;
        }
        setQuote(nextQuote);
        setLoadState("ready");
      } catch (error) {
        if (!isActive) {
          return;
        }
        setQuote(null);
        if (error instanceof PublicRequestError && error.status === 404) {
          setLoadState("invalid");
          return;
        }
        setLoadState("error");
      }
    }

    void loadQuote();
    return () => {
      isActive = false;
    };
  }, [hasToken, token]);

  const effectiveLoadState: LoadState = hasToken ? loadState : "invalid";
  const logoUrl = quote?.logo_url ?? null;
  const showLogo = logoUrl !== null && logoUrl !== hiddenLogoUrl;

  if (effectiveLoadState === "loading") {
    return (
      <main className="min-h-screen bg-background px-4 py-10 text-on-surface">
        <div className="mx-auto max-w-3xl rounded-[1.75rem] border border-surface-container-high bg-surface-container-lowest p-8 ghost-shadow">
          <p role="status" className="text-sm text-on-surface-variant">
            Loading shared quote...
          </p>
        </div>
      </main>
    );
  }

  if (effectiveLoadState === "invalid") {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#dce9ff_0%,_#f8f9ff_45%,_#eff4ff_100%)] px-4 py-10 text-on-surface">
        <div className="mx-auto max-w-xl rounded-[1.75rem] border border-surface-container-high bg-surface-container-lowest p-8 text-center ghost-shadow">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-outline">Shared Quote</p>
          <h1 className="mt-4 text-3xl font-semibold">This link is not valid</h1>
          <p className="mt-3 text-sm text-on-surface-variant">
            Double-check the link or ask the contractor to share it again.
          </p>
        </div>
      </main>
    );
  }

  if (effectiveLoadState === "error" || quote === null) {
    return (
      <main className="min-h-screen bg-background px-4 py-10 text-on-surface">
        <div className="mx-auto max-w-xl rounded-[1.75rem] border border-error/15 bg-surface-container-lowest p-8 ghost-shadow">
          <h1 className="text-2xl font-semibold">We couldn&apos;t load this quote</h1>
          <p className="mt-3 text-sm text-on-surface-variant">
            Try refreshing the page in a moment.
          </p>
        </div>
      </main>
    );
  }

  const banner = quote.status === "approved" || quote.status === "declined"
    ? statusCopy[quote.status]
    : null;
  const businessInitial = getDisplayBusinessName(quote).slice(0, 1).toUpperCase();
  const pricingBreakdown = calculatePricingFromPersisted(
    {
      totalAmount: quote.total_amount,
      taxRate: quote.tax_rate,
      discountType: quote.discount_type,
      discountValue: quote.discount_value,
      depositAmount: quote.deposit_amount,
    },
    resolveLineItemSum(quote.line_items.map((item) => item.price)),
  );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#dce9ff_0%,_#f8f9ff_42%,_#eff4ff_100%)] px-4 py-6 text-on-surface sm:px-6 lg:py-10">
      <div className="mx-auto max-w-4xl">
        <section className="overflow-hidden rounded-[1.75rem] border border-surface-container-high bg-surface-container-lowest ghost-shadow">
          <div className="forest-gradient px-5 py-6 text-on-primary sm:px-8 sm:py-8">
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/15 text-xl font-semibold uppercase text-on-primary">
                {showLogo ? (
                  <img
                    src={quote.logo_url}
                    alt={`${getDisplayBusinessName(quote)} logo`}
                    className="h-full w-full object-cover"
                    onError={() => setHiddenLogoUrl(quote.logo_url)}
                  />
                ) : (
                  businessInitial
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
                  {getDisplayBusinessName(quote)}
                </p>
                <h1 className="mt-3 text-3xl font-semibold leading-tight">
                  {getDisplayTitle(quote)}
                </h1>
                <p className="mt-2 text-sm text-white/80">
                  {quote.doc_number} · Issued {quote.issued_date}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6 px-5 py-6 sm:px-8 sm:py-8">
            {banner ? (
              <div className={`rounded-2xl px-4 py-3 text-sm font-medium ${banner.className}`}>
                {banner.title}
              </div>
            ) : null}

            <section className="grid gap-4 rounded-2xl bg-surface-container-low p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-outline">
                  Customer
                </p>
                <p className="mt-2 text-lg font-semibold">{quote.customer_name}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-outline">
                  Total
                </p>
                <p className="mt-2 text-lg font-semibold">
                  {quote.total_amount !== null ? formatCurrency(quote.total_amount) : "TBD"}
                </p>
              </div>
            </section>

            {pricingBreakdown.hasPricingBreakdown ? (
              <section className="rounded-2xl bg-surface-container-low p-4">
                <div className="space-y-2 text-sm">
                  <PricingRow label="Subtotal" value={pricingBreakdown.subtotal} />
                  {pricingBreakdown.discountAmount !== null ? (
                    <PricingRow label="Discount" value={-pricingBreakdown.discountAmount} />
                  ) : null}
                  {pricingBreakdown.taxAmount !== null ? (
                    <PricingRow label="Tax" value={pricingBreakdown.taxAmount} />
                  ) : null}
                  <PricingRow label="Total" value={pricingBreakdown.totalAmount} emphasized />
                  {pricingBreakdown.depositAmount !== null ? (
                    <>
                      <PricingRow label="Deposit" value={pricingBreakdown.depositAmount} />
                      <PricingRow label="Balance Due" value={pricingBreakdown.balanceDue} emphasized />
                    </>
                  ) : null}
                </div>
              </section>
            ) : null}

            <section>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-outline">
                  Line Items
                </h2>
                <span className="text-xs text-on-surface-variant">
                  {quote.line_items.length} item{quote.line_items.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="mt-4 space-y-3">
                {quote.line_items.map((item, index) => (
                  <li
                    key={`${index}-${item.description}-${item.details ?? "none"}`}
                    className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold">{item.description}</p>
                        {item.details ? (
                          <p className="mt-1 text-sm text-on-surface-variant">{item.details}</p>
                        ) : null}
                      </div>
                      <p className="shrink-0 text-sm font-semibold">
                        {item.price !== null ? formatCurrency(item.price) : "TBD"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {quote.notes ? (
              <section className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-4">
                <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-outline">
                  Notes
                </h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-on-surface-variant">
                  {quote.notes}
                </p>
              </section>
            ) : null}

            <a
              href={quote.download_url}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-primary px-5 py-4 text-sm font-semibold text-on-primary transition-transform active:scale-[0.99]"
            >
              Download PDF
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
