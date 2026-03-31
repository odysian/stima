import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { NavigateFunction } from "react-router-dom";

import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteDetail } from "@/features/quotes/types/quote.types";
import { isHttpRequestError } from "@/shared/lib/http";

interface UseQuoteInvoiceConversionArgs {
  quoteId: string | undefined;
  navigate: NavigateFunction;
  setQuote: Dispatch<SetStateAction<QuoteDetail | null>>;
}

interface UseQuoteInvoiceConversionResult {
  invoiceError: string | null;
  isConvertingInvoice: boolean;
  onConvertToInvoice: () => Promise<void>;
  clearInvoiceError: () => void;
}

export function useQuoteInvoiceConversion({
  quoteId,
  navigate,
  setQuote,
}: UseQuoteInvoiceConversionArgs): UseQuoteInvoiceConversionResult {
  const [isConvertingInvoice, setIsConvertingInvoice] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  async function onConvertToInvoice(): Promise<void> {
    if (!quoteId) {
      return;
    }

    setInvoiceError(null);
    setIsConvertingInvoice(true);
    try {
      const createdInvoice = await quoteService.convertToInvoice(quoteId);
      const refreshedQuote = await quoteService.getQuote(quoteId);
      setQuote(refreshedQuote);
      navigate(`/invoices/${createdInvoice.id}`);
    } catch (error) {
      let message = error instanceof Error ? error.message : "Unable to convert quote to invoice";
      const detail =
        isHttpRequestError(error)
        && error.payload
        && typeof error.payload === "object"
        && "detail" in error.payload
        && typeof error.payload.detail === "string"
          ? error.payload.detail
          : null;
      if (detail) {
        message = detail;
      }
      const isDuplicateInvoiceError = (
        isHttpRequestError(error)
        && error.status === 409
        && detail === "An invoice already exists for this quote"
      );

      if (isDuplicateInvoiceError) {
        try {
          const refreshedQuote = await quoteService.getQuote(quoteId);
          setQuote(refreshedQuote);
          if (refreshedQuote.linked_invoice) {
            navigate(`/invoices/${refreshedQuote.linked_invoice.id}`);
            return;
          }
        } catch {
          // Fall through to the user-facing error if the recovery fetch fails.
        }
      }

      setInvoiceError(message);
    } finally {
      setIsConvertingInvoice(false);
    }
  }

  return {
    invoiceError,
    isConvertingInvoice,
    onConvertToInvoice,
    clearInvoiceError: () => setInvoiceError(null),
  };
}
