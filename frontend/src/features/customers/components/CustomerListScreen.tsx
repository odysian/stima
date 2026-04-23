import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { customerService } from "@/features/customers/services/customerService";
import type { Customer } from "@/features/customers/types/customer.types";
import { BottomNav } from "@/shared/components/BottomNav";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { Input } from "@/shared/components/Input";
import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { EmptyState } from "@/ui/EmptyState";
import { useToast } from "@/ui/Toast";

interface CustomerListLocationState {
  flashMessage?: string;
}

function contactLine(customer: Customer): string {
  return [customer.phone, customer.email].filter(Boolean).join(" · ");
}

export function CustomerListScreen(): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const { show } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [flashMessage, setFlashMessage] = useState(
    (location.state as CustomerListLocationState | undefined)?.flashMessage ?? null,
  );

  useEffect(() => {
    if (!flashMessage) {
      return;
    }
    show({ message: flashMessage, variant: "success" });
    setFlashMessage(null);
  }, [flashMessage, show]);

  useEffect(() => {
    let isActive = true;

    async function fetchCustomers(): Promise<void> {
      setIsLoading(true);
      setLoadError(null);

      try {
        const nextCustomers = await customerService.listCustomers();
        if (isActive) {
          setCustomers(nextCustomers);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load customers";
        if (isActive) {
          setLoadError(message);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void fetchCustomers();

    return () => {
      isActive = false;
    };
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredCustomers = useMemo(() => {
    if (!normalizedQuery) {
      return customers;
    }

    return customers.filter((customer) => customer.name.toLowerCase().includes(normalizedQuery));
  }, [customers, normalizedQuery]);

  const showNoCustomersState = !isLoading && !loadError && customers.length === 0;
  const showNoSearchMatches =
    !isLoading && !loadError && customers.length > 0 && filteredCustomers.length === 0;
  const customerSubtitle =
    !isLoading && !loadError
      ? `${customers.length} ${customers.length === 1 ? "customer" : "customers"}`
      : undefined;

  return (
    <main className="min-h-screen bg-background pb-24">
      <ScreenHeader title="Customers" subtitle={customerSubtitle} layout="top-level" />
      <section className="mx-auto w-full max-w-3xl pb-2 pt-20">

        <div className="mb-4 px-4">
          <Input
            id="customers-search"
            label="Search customers"
            placeholder="Search customers..."
            hideLabel
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {isLoading ? (
          <p role="status" className="px-4 text-sm text-on-surface-variant">
            Loading customers...
          </p>
        ) : null}

        {loadError ? (
          <div className="mx-4">
            <FeedbackMessage variant="error">{loadError}</FeedbackMessage>
          </div>
        ) : null}

        {!isLoading && !loadError && filteredCustomers.length > 0 ? (
          <div className="mx-4 rounded-[var(--radius-document)] bg-surface-container-low p-3">
            <ul className="flex flex-col gap-3">
              {filteredCustomers.map((customer) => (
                <li key={customer.id}>
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center justify-between rounded-[var(--radius-document)] bg-surface-container-lowest p-4 text-left ghost-shadow transition-all active:scale-[0.98] active:bg-surface-container-low"
                    onClick={() => navigate(`/customers/${customer.id}`)}
                  >
                    <div>
                      <p className="font-bold text-on-surface">{customer.name}</p>
                      <p className="text-sm text-on-surface-variant">{contactLine(customer)}</p>
                    </div>
                    <span className="material-symbols-outlined text-outline">chevron_right</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {showNoCustomersState ? (
          <EmptyState className="mx-4 mt-8 p-8" icon="group" title="No customers yet." />
        ) : null}

        {showNoSearchMatches ? (
          <EmptyState
            className="mx-4 mt-8 p-8"
            icon="group"
            title="No customers match your search."
          />
        ) : null}
      </section>

      <button
        type="button"
        aria-label="New customer"
        className="fixed right-4 bottom-20 z-50 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full forest-gradient text-on-primary ghost-shadow transition-all active:scale-95"
        onClick={() => navigate("/customers/new")}
      >
        <span className="material-symbols-outlined">person_add</span>
      </button>

      <BottomNav active="customers" />
    </main>
  );
}
