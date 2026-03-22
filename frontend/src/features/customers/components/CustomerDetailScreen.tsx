import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { customerService } from "@/features/customers/services/customerService";
import type {
  Customer,
  CustomerUpdateRequest,
} from "@/features/customers/types/customer.types";
import { quoteService } from "@/features/quotes/services/quoteService";
import type { QuoteListItem } from "@/features/quotes/types/quote.types";
import { BottomNav } from "@/shared/components/BottomNav";
import { Button } from "@/shared/components/Button";
import { Input } from "@/shared/components/Input";
import { StatusBadge } from "@/shared/components/StatusBadge";

function formatTotalAmount(totalAmount: number | null): string {
  if (totalAmount === null) {
    return "\u2014";
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
          quoteService.listQuotes(),
        ]);

        if (!isActive) {
          return;
        }

        setCustomer(nextCustomer);
        setName(nextCustomer.name);
        setPhone(nextCustomer.phone ?? "");
        setEmail(nextCustomer.email ?? "");
        setAddress(nextCustomer.address ?? "");

        const filteredQuotes = nextQuotes
          .filter((quote) => quote.customer_id === customerId)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setCustomerQuotes(filteredQuotes);
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

  const quoteCountLabel = useMemo(() => {
    const count = customerQuotes.length;
    return `${count} ${count === 1 ? "QUOTE" : "QUOTES"}`;
  }, [customerQuotes.length]);

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
      <header className="fixed top-0 z-50 flex w-full items-center gap-2 border-b border-outline-variant/40 bg-white/80 px-4 py-3 backdrop-blur-md">
        <button
          type="button"
          aria-label="Back to customers"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-on-surface transition hover:bg-surface-container"
          onClick={() => navigate("/customers")}
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="font-headline text-lg font-bold tracking-tight text-on-surface">
          {customer?.name ?? "Customer"}
        </h1>
      </header>

      <section className="mx-auto w-full max-w-3xl space-y-4 px-4 pt-20">
        {isLoading ? (
          <p role="status" className="text-sm text-on-surface-variant">
            Loading customer...
          </p>
        ) : null}

        {loadError ? (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {loadError}
          </p>
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

            <section className="rounded-xl bg-surface-container-lowest p-6 ghost-shadow">
              <h2 className="mb-4 text-[0.6875rem] font-bold tracking-widest text-outline uppercase">
                Customer Info
              </h2>

              {saveSuccess ? (
                <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
                  {saveSuccess}
                </p>
              ) : null}

              {saveError ? (
                <p role="alert" className="mb-4 rounded-lg border-l-4 border-error bg-error-container p-4 text-sm text-error">
                  {saveError}
                </p>
              ) : null}

              <form className="flex flex-col gap-4" onSubmit={onSaveChanges}>
                <Input
                  id="customer-detail-name"
                  label="Name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
                <Input
                  id="customer-detail-phone"
                  label="Phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
                <Input
                  id="customer-detail-email"
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />

                <div className="flex flex-col gap-1">
                  <label htmlFor="customer-detail-address" className="text-sm font-medium text-slate-700">
                    Address
                  </label>
                  <textarea
                    id="customer-detail-address"
                    rows={4}
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    className="w-full rounded-lg bg-surface-container-high px-4 py-3 font-body text-sm text-on-surface placeholder:text-outline transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/30 focus:outline-none"
                  />
                </div>

                <Button type="submit" variant="primary" className="mt-2 w-full" isLoading={isSaving}>
                  Save Changes
                </Button>
              </form>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[0.6875rem] font-bold tracking-widest text-outline uppercase">
                  Quote History
                </p>
                <p className="text-[0.6875rem] font-bold tracking-widest text-outline uppercase">
                  {quoteCountLabel}
                </p>
              </div>

              {customerQuotes.length > 0 ? (
                <ul>
                  {customerQuotes.map((quote) => (
                    <li key={quote.id} className="mb-2 last:mb-0">
                      <button
                        type="button"
                        className="w-full rounded-lg bg-surface-container-lowest p-4 text-left ghost-shadow transition active:scale-[0.99]"
                        onClick={() => navigate(`/quotes/${quote.id}/preview`)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-headline font-bold text-on-surface">{quote.doc_number}</p>
                            <p className="mt-1 text-sm text-on-surface-variant">
                              {formatCreatedDate(quote.created_at)}
                            </p>
                          </div>
                          <StatusBadge variant={quote.status} />
                        </div>
                        <p className="mt-3 text-right font-bold text-on-surface">
                          {formatTotalAmount(quote.total_amount)}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg bg-surface-container-lowest p-4 text-sm text-outline ghost-shadow">
                  No quotes yet.
                </p>
              )}
            </section>
          </>
        ) : null}
      </section>

      <BottomNav active="customers" />
    </main>
  );
}
