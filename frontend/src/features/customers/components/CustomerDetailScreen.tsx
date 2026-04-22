import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { CustomerDeleteConfirmModal } from "@/features/customers/components/CustomerDeleteConfirmModal";
import { CustomerInfoForm } from "@/features/customers/components/CustomerInfoForm";
import { CustomerDetailLoadingSkeleton } from "@/features/customers/components/CustomerDetailLoadingSkeleton";
import { InvoiceHistoryList } from "@/features/customers/components/InvoiceHistoryList";
import { QuoteHistoryList } from "@/features/customers/components/QuoteHistoryList";
import { customerService } from "@/features/customers/services/customerService";
import type { Customer, CustomerUpdateRequest } from "@/features/customers/types/customer.types";
import { invoiceService } from "@/features/invoices/services/invoiceService";
import { useQuoteCreateFlow } from "@/features/quotes/hooks/useQuoteCreateFlow";
import { createCaptureLocationState } from "@/features/quotes/utils/workflowNavigation";
import type { InvoiceListItem } from "@/features/invoices/types/invoice.types";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteListItem } from "@/features/quotes/types/quote.types";
import { BottomNav } from "@/shared/components/BottomNav";
import { Button } from "@/shared/components/Button";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { Eyebrow } from "@/ui/Eyebrow";
import { useToast } from "@/ui/Toast";
type HistoryMode = "quotes" | "invoices";

function getCustomerDraftValues(nextCustomer: Customer): {
  name: string;
  phone: string;
  email: string;
  address: string;
} {
  return {
    name: nextCustomer.name,
    phone: nextCustomer.phone ?? "",
    email: nextCustomer.email ?? "",
    address: nextCustomer.address ?? "",
  };
}
export function CustomerDetailScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { show } = useToast();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerQuotes, setCustomerQuotes] = useState<QuoteListItem[]>([]);
  const [customerInvoices, setCustomerInvoices] = useState<InvoiceListItem[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const [invoiceLoadError, setInvoiceLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [historyMode, setHistoryMode] = useState<HistoryMode>("quotes");
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function populateDraftFields(nextCustomer: Customer): void {
    const draftValues = getCustomerDraftValues(nextCustomer);
    setName(draftValues.name);
    setPhone(draftValues.phone);
    setEmail(draftValues.email);
    setAddress(draftValues.address);
  }

  function resetEditState(nextCustomer: Customer): void {
    populateDraftFields(nextCustomer);
    setSaveError(null);
    setIsEditing(false);
  }

  function openEditMode(): void {
    if (!customer) {
      return;
    }
    populateDraftFields(customer);
    setSaveError(null);
    setIsEditing(true);
  }

  useEffect(() => {
    if (!id) {
      setLoadError("Missing customer id.");
      setIsLoading(false);
      return;
    }
    const customerId = id;

    let isActive = true;

    async function fetchCustomerHubData(): Promise<void> {
      setIsLoading(true);
      setLoadError(null);

      try {
        const [nextCustomer, nextQuotes] = await Promise.all([
          customerService.getCustomer(customerId),
          quoteService.listQuotes({ customer_id: customerId }),
        ]);

        if (!isActive) {
          return;
        }

        setCustomer(nextCustomer);
        const draftValues = getCustomerDraftValues(nextCustomer);
        setName(draftValues.name);
        setPhone(draftValues.phone);
        setEmail(draftValues.email);
        setAddress(draftValues.address);
        setCustomerQuotes(nextQuotes);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load customer";
        if (isActive) {
          setLoadError(message);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void fetchCustomerHubData();

    return () => {
      isActive = false;
    };
  }, [id]);

  useEffect(() => {
    if (!id) {
      setCustomerInvoices([]);
      setInvoiceLoadError("Missing customer id.");
      setIsLoadingInvoices(false);
      return;
    }

    let isActive = true;

    async function fetchCustomerInvoices(): Promise<void> {
      setIsLoadingInvoices(true);
      setInvoiceLoadError(null);
      setCustomerInvoices([]);

      try {
        const nextInvoices = await invoiceService.listInvoices({ customer_id: id });
        if (isActive) {
          setCustomerInvoices(nextInvoices);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load invoices";
        if (isActive) {
          setCustomerInvoices([]);
          setInvoiceLoadError(message);
        }
      } finally {
        if (isActive) {
          setIsLoadingInvoices(false);
        }
      }
    }

    void fetchCustomerInvoices();

    return () => {
      isActive = false;
    };
  }, [id]);

  async function onSaveChanges(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!id) {
      setSaveError("Missing customer id.");
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setSaveError("Name is required");
      return;
    }

    const payload: CustomerUpdateRequest = { name: trimmedName };
    payload.phone = phone.trim() || null;
    payload.email = email.trim() || null;
    payload.address = address.trim() || null;

    setSaveError(null);
    setIsSaving(true);

    try {
      const updatedCustomer = await customerService.updateCustomer(id, payload);
      setCustomer(updatedCustomer);
      show({ message: "Saved", variant: "success" });
      setSaveError(null);
      setIsEditing(false);
      populateDraftFields(updatedCustomer);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save customer";
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  }

  function openDeleteConfirmation(): void {
    if (!customer) {
      return;
    }
    setDeleteConfirmationName("");
    setDeleteError(null);
    setIsDeleteConfirmOpen(true);
  }

  function closeDeleteConfirmation(): void {
    if (isDeleting) {
      return;
    }
    setIsDeleteConfirmOpen(false);
    setDeleteConfirmationName("");
    setDeleteError(null);
  }

  async function onDeleteCustomer(): Promise<void> {
    if (!id || !customer || deleteConfirmationName !== customer.name) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await customerService.deleteCustomer(id);
      navigate("/customers", {
        replace: true,
        state: { flashMessage: "Customer deleted" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete customer";
      setDeleteError(message);
    } finally {
      setIsDeleting(false);
    }
  }

  function formatSummaryValue(value: string | null | undefined, fallback: string): string {
    if (!value) {
      return fallback;
    }
    const trimmedValue = value.trim();
    return trimmedValue || fallback;
  }

  const activeHistoryCount = historyMode === "quotes" ? customerQuotes.length : customerInvoices.length;
  const activeHistoryCountLabel = `${activeHistoryCount} ${activeHistoryCount === 1 ? "ITEM" : "ITEMS"}`;
  const deleteConfirmationMatches = customer ? deleteConfirmationName === customer.name : false;
  const quoteCreateFlow = useQuoteCreateFlow({
    customerId: customer?.id,
    timezone: user?.timezone,
    entrySheetTitle: "Create document",
    entrySheetDescription: "Create a new quote or duplicate an existing quote.",
    onCreateNew: () => {
      if (!customer) {
        return;
      }
      navigate(`/quotes/capture/${customer.id}`, {
        state: createCaptureLocationState(`/customers/${customer.id}`),
      });
    },
    onQuoteDuplicated: (quoteId) => navigate(`/documents/${quoteId}/edit`),
  });

  return (
    <main className="min-h-screen bg-background pb-24">
      <ScreenHeader
        title={customer?.name ?? "Customer"}
        backLabel="Back to customers"
        onBack={() => navigate("/customers")}
      />
      <section className="mx-auto w-full max-w-3xl space-y-4 px-4 pt-20">
        {isLoading ? (
          <div role="status" aria-label="Loading customer" className="space-y-4">
            <CustomerDetailLoadingSkeleton />
          </div>
        ) : null}
        {loadError ? (
          <FeedbackMessage variant="error">{loadError}</FeedbackMessage>
        ) : null}
        {!isLoading && !loadError && customer ? (
          <>
            {!isEditing ? (
              <section className="rounded-[var(--radius-document)] bg-surface-container-lowest p-4 ghost-shadow">
                <div className="flex flex-col gap-3">
                  <dl className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-3">
                      <dt className="w-16 shrink-0">
                        <Eyebrow>Phone</Eyebrow>
                      </dt>
                      <dd className="text-sm text-on-surface">
                        {formatSummaryValue(customer.phone, "—")}
                      </dd>
                    </div>
                    <div className="flex items-center gap-3">
                      <dt className="w-16 shrink-0">
                        <Eyebrow>Email</Eyebrow>
                      </dt>
                      <dd className="min-w-0 truncate text-sm text-on-surface">
                        {formatSummaryValue(customer.email, "—")}
                      </dd>
                    </div>
                    <div className="flex items-start gap-3">
                      <dt className="w-16 shrink-0 pt-0.5">
                        <Eyebrow>Address</Eyebrow>
                      </dt>
                      <dd className="whitespace-pre-wrap text-sm text-on-surface">
                        {formatSummaryValue(customer.address, "—")}
                      </dd>
                    </div>
                  </dl>

                  <div className="flex gap-2 pt-1">
                    <Button
                      type="button"
                      variant="primary"
                      className="flex-1"
                      onClick={quoteCreateFlow.openCreateEntry}
                    >
                      Create Document
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      onClick={openEditMode}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="md"
                      onClick={openDeleteConfirmation}
                    >
                      Delete Customer
                    </Button>
                  </div>
                </div>
              </section>
            ) : (
              <CustomerInfoForm
                name={name}
                phone={phone}
                email={email}
                address={address}
                onNameChange={(event) => setName(event.target.value)}
                onPhoneChange={(event) => setPhone(event.target.value)}
                onEmailChange={(event) => setEmail(event.target.value)}
                onAddressChange={(event) => setAddress(event.target.value)}
                onSubmit={onSaveChanges}
                onCancel={() => resetEditState(customer)}
                isSaving={isSaving}
                saveError={saveError}
              />
            )}
            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div
                  aria-label="Customer history type filter"
                  className="inline-flex rounded-full bg-surface-container-low p-1"
                >
                  <button
                    type="button"
                    aria-pressed={historyMode === "quotes"}
                    className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition ${
                      historyMode === "quotes"
                        ? "bg-surface-container-lowest text-on-surface shadow-sm"
                        : "text-on-surface-variant"
                    }`}
                    onClick={() => setHistoryMode("quotes")}
                  >
                    Quotes
                  </button>
                  <button
                    type="button"
                    aria-pressed={historyMode === "invoices"}
                    className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition ${
                      historyMode === "invoices"
                        ? "bg-surface-container-lowest text-on-surface shadow-sm"
                        : "text-on-surface-variant"
                    }`}
                    onClick={() => setHistoryMode("invoices")}
                  >
                    Invoices
                  </button>
                </div>
                <Eyebrow className="shrink-0">{activeHistoryCountLabel}</Eyebrow>
              </div>

              {historyMode === "quotes" ? (
                <QuoteHistoryList
                  quotes={customerQuotes}
                  onQuoteClick={(quoteId) => navigate(`/quotes/${quoteId}/preview`)}
                  timezone={user?.timezone}
                  showHeader={false}
                />
              ) : (
                <InvoiceHistoryList
                  invoices={customerInvoices}
                  isLoading={isLoadingInvoices}
                  loadError={invoiceLoadError}
                  onInvoiceClick={(invoiceId) => navigate(`/invoices/${invoiceId}`)}
                  timezone={user?.timezone}
                  showHeader={false}
                />
              )}
            </section>
          </>
        ) : null}
      </section>
      {quoteCreateFlow.dialogs}
      {isDeleteConfirmOpen && customer ? (
        <CustomerDeleteConfirmModal
          customerName={customer.name}
          quoteCount={customerQuotes.length}
          invoiceCount={customerInvoices.length}
          confirmationName={deleteConfirmationName}
          deleteError={deleteError}
          isDeleting={isDeleting}
          confirmationMatches={deleteConfirmationMatches}
          onConfirmationChange={setDeleteConfirmationName}
          onConfirm={() => void onDeleteCustomer()}
          onCancel={closeDeleteConfirmation}
        />
      ) : null}
      <BottomNav active="customers" />
    </main>
  );
}
