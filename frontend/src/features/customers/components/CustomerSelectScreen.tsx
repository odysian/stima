import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useQuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";
import { customerService } from "@/features/customers/services/customerService";
import type {
  Customer,
  CustomerCreateRequest,
} from "@/features/customers/types/customer.types";
import { Button } from "@/shared/components/Button";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { Input } from "@/shared/components/Input";
import { ScreenHeader } from "@/shared/components/ScreenHeader";

type ScreenMode = "search" | "create";

export function CustomerSelectScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { clearDraft } = useQuoteDraft();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<ScreenMode>("search");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    clearDraft();
  }, [clearDraft]);

  useEffect(() => {
    let mounted = true;

    async function loadCustomers(): Promise<void> {
      setLoading(true);
      setLoadError(null);

      try {
        const customerList = await customerService.listCustomers();
        if (mounted) {
          setCustomers(customerList);
        }
      } catch (error) {
        if (mounted) {
          const message = error instanceof Error ? error.message : "Unable to load customers";
          setLoadError(message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadCustomers();

    return () => {
      mounted = false;
    };
  }, []);

  const filteredCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return customers;
    }
    return customers.filter((customer) =>
      customer.name.toLowerCase().includes(normalizedQuery),
    );
  }, [customers, query]);

  function onSelectCustomer(customerId: string): void {
    navigate(`/quotes/capture/${customerId}`);
  }

  function onSwitchToCreateMode(): void {
    setCreateError(null);
    setMode("create");
  }

  function onBackToSearch(): void {
    setCreateError(null);
    setMode("search");
  }

  async function onCreateCustomer(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setCreateError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setCreateError("Name is required");
      return;
    }

    const payload: CustomerCreateRequest = { name: trimmedName };
    if (phone.trim()) {
      payload.phone = phone.trim();
    }
    if (email.trim()) {
      payload.email = email.trim();
    }
    if (address.trim()) {
      payload.address = address.trim();
    }

    setIsCreating(true);
    try {
      const createdCustomer = await customerService.createCustomer(payload);
      navigate(`/quotes/capture/${createdCustomer.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create customer";
      setCreateError(message);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <ScreenHeader
        title={mode === "search" ? "New Quote" : "New Customer"}
        subtitle={mode === "search" ? "Select a customer to continue" : undefined}
        onBack={() => navigate(-1)}
      />

      <section className={`mx-auto w-full max-w-3xl px-4 pt-20 ${mode === "search" ? "pb-24" : "pb-8"}`}>
        {mode === "search" ? (
          <>
            <Input
              id="customer-search"
              label="Search customers"
              placeholder="Search customers..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />

            {loading ? (
              <p role="status" className="mt-4 text-sm text-on-surface-variant">
                Loading customers...
              </p>
            ) : null}
            {loadError ? (
              <div className="mt-4">
                <FeedbackMessage variant="error">{loadError}</FeedbackMessage>
              </div>
            ) : null}

            {!loading && !loadError ? (
              <div className="mt-4">
                {filteredCustomers.length > 0 ? (
                  filteredCustomers.map((customer) => {
                    const subtitle = [customer.phone, customer.email].filter(Boolean).join(" · ");
                    return (
                      <button
                        key={customer.id}
                        type="button"
                        className="mb-2 flex w-full items-center justify-between rounded-lg bg-surface-container-lowest p-4 text-left transition-all active:scale-[0.99]"
                        onClick={() => onSelectCustomer(customer.id)}
                      >
                        <div>
                          <p className="font-bold text-on-surface">{customer.name}</p>
                          {subtitle ? (
                            <p className="text-sm text-on-surface-variant">{subtitle}</p>
                          ) : null}
                        </div>
                        <span className="material-symbols-outlined text-outline">chevron_right</span>
                      </button>
                    );
                  })
                ) : (
                  <p className="mt-6 text-center text-sm text-outline">No customers found.</p>
                )}
              </div>
            ) : null}
          </>
        ) : (
          <section className="rounded-xl bg-surface-container-lowest p-6 ghost-shadow">
            {createError ? (
              <div className="mb-4">
                <FeedbackMessage variant="error">{createError}</FeedbackMessage>
              </div>
            ) : null}

            <form className="flex flex-col gap-4" onSubmit={onCreateCustomer}>
              <Input
                id="customer-name"
                label="Full Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <Input
                id="customer-phone"
                label="Phone Number"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
              <Input
                id="customer-email"
                label="Email Address"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />

              <div className="flex flex-col gap-1">
                <label htmlFor="customer-address" className="text-sm font-medium text-on-surface-variant">
                  Address
                </label>
                <textarea
                  id="customer-address"
                  rows={4}
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  className="w-full rounded-lg bg-surface-container-high px-4 py-3 font-body text-sm text-on-surface placeholder:text-outline transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/30 focus:outline-none"
                />
              </div>

              <Button type="submit" variant="primary" className="mt-2 w-full" isLoading={isCreating}>
                Create {"&"} Continue {">"}
              </Button>
              <button
                type="button"
                className="text-sm font-semibold text-on-surface-variant transition-colors hover:text-on-surface"
                onClick={onBackToSearch}
              >
                Back to search
              </button>
            </form>
          </section>
        )}
      </section>

      {mode === "search" ? (
        <div className="fixed bottom-0 z-40 w-full bg-background/80 p-4 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-3xl">
            <Button variant="primary" className="w-full" onClick={onSwitchToCreateMode}>
              <span className="material-symbols-outlined mr-2 text-sm">person_add</span>
              ADD NEW CUSTOMER
            </Button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
