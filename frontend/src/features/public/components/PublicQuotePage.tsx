import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import {
  PublicRequestError,
  publicService,
} from "@/features/public/services/publicService";
import type { PublicDocument } from "@/features/public/types/public.types";
import { PricingRow } from "@/shared/components/PricingRow";
import { formatCurrency } from "@/shared/lib/formatters";
import { calculatePricingFromPersisted, resolveLineItemSum } from "@/shared/lib/pricing";
import { Eyebrow } from "@/ui/Eyebrow";
import { StatusPill, type StatusPillVariant } from "@/ui/StatusPill";

type LoadState = "loading" | "ready" | "invalid" | "error";

const statusCopy = {
  approved: {
    title: "This quote has been accepted",
    icon: "check_circle",
    pillVariant: "approved" as StatusPillVariant,
    className: "border border-success/20 bg-success-container text-success",
  },
  declined: {
    title: "This quote is no longer available",
    icon: "error",
    pillVariant: "declined" as StatusPillVariant,
    className: "border border-warning/20 bg-warning-container text-warning",
  },
} as const;

function getDisplayTitle(documentData: PublicDocument | null): string {
  if (!documentData) {
    return "Shared Document";
  }
  return documentData.title?.trim() || documentData.doc_number;
}

function getDisplayBusinessName(documentData: PublicDocument | null): string | null {
  if (!documentData) {
    return null;
  }
  const businessName = documentData.business_name?.trim();
  if (businessName) {
    return businessName;
  }

  const ownerName = documentData.owner_name?.trim();
  return ownerName || null;
}

function getDocumentLabel(documentData: PublicDocument | null): string {
  if (documentData?.doc_type === "invoice") {
    return "Invoice";
  }
  return "Quote";
}

export function PublicQuotePage(): React.ReactElement {
  const { token } = useParams<{ token: string }>();
  const hasToken = typeof token === "string" && token.length > 0;
  const [documentData, setDocumentData] = useState<PublicDocument | null>(null);
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
      document.title = "Shared Document Unavailable";
      return;
    }
    if (loadState === "error") {
      document.title = "Shared Document";
      return;
    }
    const businessName = getDisplayBusinessName(documentData);
    const displayTitle = getDisplayTitle(documentData);
    document.title = businessName ? `${displayTitle} | ${businessName}` : displayTitle;
  }, [documentData, hasToken, loadState]);

  useEffect(() => {
    if (!hasToken) {
      return;
    }
    const shareToken = token ?? "";

    let isActive = true;

    async function loadDocument(): Promise<void> {
      setLoadState("loading");
      try {
        const nextDocument = await publicService.getDocument(shareToken);
        if (!isActive) {
          return;
        }
        setDocumentData(nextDocument);
        setLoadState("ready");
      } catch (error) {
        if (!isActive) {
          return;
        }
        setDocumentData(null);
        if (error instanceof PublicRequestError && error.status === 404) {
          setLoadState("invalid");
          return;
        }
        setLoadState("error");
      }
    }

    void loadDocument();
    return () => {
      isActive = false;
    };
  }, [hasToken, token]);

  const effectiveLoadState: LoadState = hasToken ? loadState : "invalid";
  const logoUrl = documentData?.logo_url ?? null;
  const showLogo = logoUrl !== null && logoUrl !== hiddenLogoUrl;

  if (effectiveLoadState === "loading") {
    return (
      <main className="screen-radial-backdrop min-h-screen px-4 py-10 text-on-surface">
        <div className="mx-auto max-w-3xl rounded-[var(--radius-document)] border border-surface-container-high bg-surface-container-lowest p-8 ghost-shadow">
          <p role="status" className="text-sm text-on-surface-variant">
            Loading shared document...
          </p>
        </div>
      </main>
    );
  }

  if (effectiveLoadState === "invalid") {
    return (
      <main className="screen-radial-backdrop min-h-screen px-4 py-10 text-on-surface">
        <div className="mx-auto max-w-xl rounded-[var(--radius-document)] border border-surface-container-high bg-surface-container-lowest p-8 text-center ghost-shadow">
          <Eyebrow>Shared Document</Eyebrow>
          <h1 className="mt-4 text-3xl font-semibold">This link is not valid</h1>
          <p className="mt-3 text-sm text-on-surface-variant">
            Double-check the link or ask the contractor to share it again.
          </p>
        </div>
      </main>
    );
  }

  if (effectiveLoadState === "error" || documentData === null) {
    return (
      <main className="screen-radial-backdrop min-h-screen px-4 py-10 text-on-surface">
        <div className="mx-auto max-w-xl rounded-[var(--radius-document)] border border-error/15 bg-surface-container-lowest p-8 ghost-shadow">
          <h1 className="text-2xl font-semibold">We couldn&apos;t load this document</h1>
          <p className="mt-3 text-sm text-on-surface-variant">
            Try refreshing the page in a moment.
          </p>
        </div>
      </main>
    );
  }

  const banner = documentData.doc_type === "quote"
    && (documentData.status === "approved" || documentData.status === "declined")
    ? statusCopy[documentData.status]
    : null;
  const displayBusinessName = getDisplayBusinessName(documentData);
  const businessInitial = (displayBusinessName ?? getDocumentLabel(documentData)).slice(0, 1).toUpperCase();
  const pricingBreakdown = calculatePricingFromPersisted(
    {
      totalAmount: documentData.total_amount,
      taxRate: documentData.tax_rate,
      discountType: documentData.discount_type,
      discountValue: documentData.discount_value,
      depositAmount: documentData.deposit_amount,
    },
    resolveLineItemSum(documentData.line_items.map((item) => item.price)),
  );
  const isInvoice = documentData.doc_type === "invoice";
  const summaryGridColsClass = isInvoice ? "lg:grid-cols-3" : "lg:grid-cols-2";

  return (
    <main className="screen-radial-backdrop min-h-screen px-4 py-6 text-on-surface sm:px-6 lg:py-10">
      <div className="mx-auto max-w-4xl">
        <section className="overflow-hidden rounded-[var(--radius-document)] border border-surface-container-high bg-surface-container-lowest ghost-shadow">
          <div className="forest-gradient px-5 py-6 text-on-primary sm:px-8 sm:py-8">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-document)] bg-on-primary/15 text-xl font-semibold uppercase text-on-primary ring-1 ring-on-primary/20 sm:h-20 sm:w-24 sm:text-2xl">
                {showLogo ? (
                  <img
                    src={documentData.logo_url}
                    alt={displayBusinessName ? `${displayBusinessName} logo` : `${getDocumentLabel(documentData)} logo`}
                    className="h-full w-full object-contain p-2"
                    onError={() => setHiddenLogoUrl(documentData.logo_url)}
                  />
                ) : (
                  businessInitial
                )}
              </div>
              <div className="min-w-0">
                {displayBusinessName ? (
                  <Eyebrow className="text-on-primary/70">{displayBusinessName}</Eyebrow>
                ) : null}
                <h1 className="mt-2 text-2xl font-semibold leading-tight sm:mt-3 sm:text-3xl">
                  {getDisplayTitle(documentData)}
                </h1>
                <p className="mt-2 text-sm text-on-primary/80">
                  {getDocumentLabel(documentData)} {documentData.doc_number} · Issued {documentData.issued_date}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6 px-5 py-6 sm:px-8 sm:py-8">
            {banner ? (
              <div className={`flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-document)] px-4 py-3 text-sm font-medium ${banner.className}`}>
                <div className="flex min-w-0 items-center gap-2">
                  <span aria-hidden="true" className="material-symbols-outlined text-[1.125rem] leading-none">
                    {banner.icon}
                  </span>
                  <p>{banner.title}</p>
                </div>
                <StatusPill variant={banner.pillVariant} />
              </div>
            ) : null}

            <section
              className={`grid gap-4 rounded-[var(--radius-document)] bg-surface-container-low p-4 sm:grid-cols-2 ${summaryGridColsClass}`}
            >
              <div>
                <Eyebrow>Customer</Eyebrow>
                <p className="mt-2 text-lg font-semibold">{documentData.customer_name}</p>
              </div>
              <div className="sm:text-right">
                <Eyebrow>Total</Eyebrow>
                <p className="mt-2 text-lg font-semibold">
                  {documentData.total_amount !== null ? formatCurrency(documentData.total_amount) : "TBD"}
                </p>
              </div>
              {isInvoice ? (
                <div className="lg:text-right">
                  <Eyebrow>Due Date</Eyebrow>
                  <p className="mt-2 text-lg font-semibold">
                    {documentData.due_date ?? "Not set"}
                  </p>
                </div>
              ) : null}
            </section>

            <section>
              <div className="flex items-center justify-between gap-3">
                <Eyebrow as="h2">Line Items</Eyebrow>
                <span className="text-xs text-on-surface-variant">
                  {documentData.line_items.length} item{documentData.line_items.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="mt-4 space-y-3">
                {documentData.line_items.map((item, index) => {
                  return (
                    <li
                      key={`${index}-${item.description}-${item.details ?? "none"}`}
                      className="rounded-[var(--radius-document)] border border-surface-container-high bg-surface-container-lowest p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-semibold break-words [overflow-wrap:anywhere]">
                            {item.description}
                          </p>
                          {item.details ? (
                            <p className="mt-1 text-sm text-on-surface-variant break-words [overflow-wrap:anywhere]">
                              {item.details}
                            </p>
                          ) : null}
                        </div>
                        <p className="shrink-0 text-sm font-semibold">
                          {item.price !== null ? formatCurrency(item.price) : "—"}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {pricingBreakdown.hasPricingBreakdown ? (
              <section className="rounded-[var(--radius-document)] bg-surface-container-low p-4">
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

            {documentData.notes ? (
              <section className="rounded-[var(--radius-document)] border border-surface-container-high bg-surface-container-lowest p-4">
                <Eyebrow as="h2">Notes</Eyebrow>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-on-surface-variant">
                  {documentData.notes}
                </p>
              </section>
            ) : null}

            <a
              href={documentData.download_url}
              className="inline-flex w-full items-center justify-center rounded-[var(--radius-document)] bg-primary px-5 py-4 text-sm font-semibold text-on-primary transition-transform active:scale-[0.99]"
            >
              Download PDF
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
