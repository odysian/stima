import { StatusBadge } from "@/shared/components/StatusBadge";

import type { QuoteStatus } from "@/features/quotes/types/quote.types";

interface QuoteStatusSummaryCardProps {
  cardState: QuoteStatus;
  hasLocalPdf: boolean;
  statusVariant: QuoteStatus;
}

function getStatusCardCopy(
  cardState: QuoteStatus,
  hasLocalPdf: boolean,
): {
  label: string;
  title: string;
  description: string;
  icon: string;
  iconClasses: string;
} {
  if (cardState === "shared") {
    return {
      label: "SHARE STATUS",
      title: "Quote shared",
      description: "Use the link below to copy or resend the quote.",
      icon: "ios_share",
      iconClasses: "bg-info-container text-info",
    };
  }

  if (cardState === "viewed") {
    return {
      label: "CUSTOMER STATUS",
      title: "Quote viewed",
      description: "Your customer opened the quote. Record the outcome once you confirm their decision.",
      icon: "visibility",
      iconClasses: "bg-warning-container text-warning",
    };
  }

  if (cardState === "approved") {
    return {
      label: "OUTCOME",
      title: "Quote approved",
      description: "The customer accepted this quote. You can still open the PDF for reference.",
      icon: "check_circle",
      iconClasses: "bg-success-container text-success",
    };
  }

  if (cardState === "declined") {
    return {
      label: "OUTCOME",
      title: "Quote declined",
      description: "This quote has been marked as lost. You can still open the PDF for reference.",
      icon: "cancel",
      iconClasses: "bg-error-container text-error",
    };
  }

  if (cardState === "ready") {
    return {
      label: "PDF STATUS",
      title: "PDF ready",
      description: hasLocalPdf
        ? "Open the PDF or share the quote link with your customer."
        : "Generate the PDF on this device to open it or share it with your customer.",
      icon: "description",
      iconClasses: "bg-success-container text-success",
    };
  }

  return {
    label: "PDF STATUS",
    title: "PDF not generated",
    description: "Generate the quote PDF to open it or share it with your customer.",
    icon: "description",
    iconClasses: "bg-surface-container-high text-on-surface-variant",
  };
}

export function QuoteStatusSummaryCard({
  cardState,
  hasLocalPdf,
  statusVariant,
}: QuoteStatusSummaryCardProps): React.ReactElement {
  const statusCardCopy = getStatusCardCopy(cardState, hasLocalPdf);

  return (
    <section className="mx-4 mt-4 rounded-xl bg-surface-container-low p-3">
      <div className="ghost-shadow rounded-xl bg-surface-container-lowest p-5">
        <div className="flex items-start gap-4">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${statusCardCopy.iconClasses}`}
          >
            <span className="material-symbols-outlined text-2xl">{statusCardCopy.icon}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                {statusCardCopy.label}
              </p>
              <StatusBadge variant={statusVariant} />
            </div>
            <h2 className="mt-3 font-headline text-2xl font-bold tracking-tight text-on-surface">
              {statusCardCopy.title}
            </h2>
            <p className="mt-2 text-sm text-on-surface-variant">
              {statusCardCopy.description}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
