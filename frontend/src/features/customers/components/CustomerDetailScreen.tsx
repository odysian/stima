import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { CustomerInfoForm } from "@/features/customers/components/CustomerInfoForm";
import { QuoteHistoryList } from "@/features/customers/components/QuoteHistoryList";
import { customerService } from "@/features/customers/services/customerService";
import type {
  Customer,
  CustomerUpdateRequest,
} from "@/features/customers/types/customer.types";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteListItem } from "@/features/quotes/types/quote.types";
import { BottomNav } from "@/shared/components/BottomNav";
import { Button } from "@/shared/components/Button";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { ScreenHeader } from "@/shared/components/ScreenHeader";

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
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerQuotes, setCustomerQuotes] = useState<QuoteListItem[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

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
    setSaveSuccess(null);
    setIsEditing(false);
  }

  function openEditMode(): void {
    if (!customer) {
      return;
    }

    populateDraftFields(customer);
    setSaveError(null);
    setSaveSuccess(null);
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

  async function onSaveChanges(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!id) {
      setSaveError("Missing customer id.");
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setSaveError("Name is required");
      setSaveSuccess(null);
      return;
    }

    const payload: CustomerUpdateRequest = { name: trimmedName };
    payload.phone = phone.trim() || null;
    payload.email = email.trim() || null;
    payload.address = address.trim() || null;

    setSaveError(null);
    setSaveSuccess(null);
    setIsSaving(true);

    try {
      const updatedCustomer = await customerService.updateCustomer(id, payload);
      setCustomer(updatedCustomer);
      setSaveSuccess("Saved");
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

  function formatSummaryValue(value: string | null | undefined, fallback: string): string {
    if (!value) {
      return fallback;
    }

    const trimmedValue = value.trim();
    return trimmedValue || fallback;
  }

  return (
    <main className="min-h-screen bg-background pb-24">
      <ScreenHeader
        title={customer?.name ?? "Customer"}
        backLabel="Back to customers"
        onBack={() => navigate("/customers")}
      />

      <section className="mx-auto w-full max-w-3xl space-y-4 px-4 pt-20">
        {isLoading ? (
          <p role="status" className="text-sm text-on-surface-variant">
            Loading customer...
          </p>
        ) : null}

        {loadError ? (
          <FeedbackMessage variant="error">{loadError}</FeedbackMessage>
        ) : null}

        {!isLoading && !loadError && customer ? (
          <>
            <section className="rounded-xl bg-surface-container-lowest p-6 ghost-shadow">
              <div className="flex flex-col gap-5">
                <div className="space-y-1">
                  <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                    Customer Overview
                  </p>
                  <h2 className="font-headline text-2xl font-bold tracking-tight text-on-surface">
                    {customer.name}
                  </h2>
                </div>

                {saveSuccess ? (
                  <p
                    role="status"
                    className="rounded-lg bg-success-container px-4 py-3 text-sm text-success"
                  >
                    {saveSuccess}
                  </p>
                ) : null}

                <dl className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1 rounded-lg bg-surface-container-low px-4 py-3">
                    <dt className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                      Phone
                    </dt>
                    <dd className="text-sm text-on-surface">
                      {formatSummaryValue(customer.phone, "No phone added")}
                    </dd>
                  </div>
                  <div className="space-y-1 rounded-lg bg-surface-container-low px-4 py-3">
                    <dt className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                      Email
                    </dt>
                    <dd className="text-sm text-on-surface">
                      {formatSummaryValue(customer.email, "No email added")}
                    </dd>
                  </div>
                  <div className="space-y-1 rounded-lg bg-surface-container-low px-4 py-3 sm:col-span-2">
                    <dt className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                      Address
                    </dt>
                    <dd className="whitespace-pre-wrap text-sm text-on-surface">
                      {formatSummaryValue(customer.address, "No address added")}
                    </dd>
                  </div>
                </dl>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    type="button"
                    variant="primary"
                    className="w-full sm:flex-1"
                    onClick={() => navigate(`/quotes/capture/${customer.id}`)}
                  >
                    Create Quote {"->"}
                  </Button>
                  {!isEditing ? (
                    <button
                      type="button"
                      onClick={openEditMode}
                      className="w-full rounded-lg border border-outline/20 px-4 py-4 text-sm font-semibold text-on-surface transition-all hover:bg-surface-container-low sm:w-auto sm:min-w-36"
                    >
                      Edit Customer
                    </button>
                  ) : (
                    <div className="flex items-center justify-center rounded-lg border border-primary/20 bg-primary/5 px-4 py-4 text-sm font-medium text-primary sm:min-w-36">
                      Editing details
                    </div>
                  )}
                </div>
              </div>
            </section>

            {isEditing ? (
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
                saveSuccess={saveSuccess}
              />
            ) : null}

            <QuoteHistoryList
              quotes={customerQuotes}
              onQuoteClick={(quoteId) => navigate(`/quotes/${quoteId}/preview`)}
              timezone={user?.timezone}
            />
          </>
        ) : null}
      </section>

      <BottomNav active="customers" />
    </main>
  );
}
