import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { invoiceService } from "@/features/invoices/services/invoiceService";
import type { InvoiceDetail } from "@/features/invoices/types/invoice.types";

interface UseInvoiceDetailResult {
  invoice: InvoiceDetail | null;
  setInvoice: Dispatch<SetStateAction<InvoiceDetail | null>>;
  isLoadingInvoice: boolean;
  loadError: string | null;
  loadInvoiceDetail: (invoiceId: string) => Promise<void>;
}

export function useInvoiceDetail(invoiceId: string | undefined): UseInvoiceDetailResult {
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [isLoadingInvoice, setIsLoadingInvoice] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadInvoiceDetail = useCallback(async (nextInvoiceId: string): Promise<void> => {
    setIsLoadingInvoice(true);
    setLoadError(null);
    try {
      const fetchedInvoice = await invoiceService.getInvoice(nextInvoiceId);
      setInvoice(fetchedInvoice);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load invoice";
      setLoadError(message);
    } finally {
      setIsLoadingInvoice(false);
    }
  }, []);

  useEffect(() => {
    if (!invoiceId) {
      setLoadError("Missing invoice id.");
      setIsLoadingInvoice(false);
      return;
    }

    let isActive = true;

    void (async () => {
      setIsLoadingInvoice(true);
      setLoadError(null);
      try {
        const fetchedInvoice = await invoiceService.getInvoice(invoiceId);
        if (!isActive) {
          return;
        }
        setInvoice(fetchedInvoice);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load invoice";
        if (isActive) {
          setLoadError(message);
        }
      } finally {
        if (isActive) {
          setIsLoadingInvoice(false);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [invoiceId]);

  return {
    invoice,
    setInvoice,
    isLoadingInvoice,
    loadError,
    loadInvoiceDetail,
  };
}
