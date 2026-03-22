import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

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

export function CustomerDetailScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

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
        setName(nextCustomer.name);
        setPhone(nextCustomer.phone ?? "");
        setEmail(nextCustomer.email ?? "");
        setAddress(nextCustomer.address ?? "");

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
      setName(updatedCustomer.name);
      setPhone(updatedCustomer.phone ?? "");
      setEmail(updatedCustomer.email ?? "");
      setAddress(updatedCustomer.address ?? "");
      setSaveSuccess("Saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save customer";
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
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
            <Button
              type="button"
              variant="primary"
              className="w-full"
              onClick={() => navigate(`/quotes/capture/${customer.id}`)}
            >
              Create Quote {"->"}
            </Button>

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
              isSaving={isSaving}
              saveError={saveError}
              saveSuccess={saveSuccess}
            />

            <QuoteHistoryList
              quotes={customerQuotes}
              onQuoteClick={(quoteId) => navigate(`/quotes/${quoteId}/preview`)}
            />
          </>
        ) : null}
      </section>

      <BottomNav active="customers" />
    </main>
  );
}
