import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { customerService } from "@/features/customers/services/customerService";
import type { Customer } from "@/features/customers/types/customer.types";
import { BottomNav } from "@/shared/components/BottomNav";
import { Input } from "@/shared/components/Input";

function contactLine(customer: Customer): string {
  return [customer.phone, customer.email].filter(Boolean).join(" · ");
}

export function CustomerListScreen(): React.ReactElement {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  return (
    <main className="min-h-screen bg-background pb-24">
      <section className="mx-auto w-full max-w-3xl py-2">
        <div className="px-4 pt-6 pb-4">
          <h1 className="font-headline text-2xl font-bold tracking-tight text-primary">Customers</h1>
        </div>

        <div className="mb-4 px-4">
          <Input
            id="customers-search"
            label="Search customers"
            placeholder="Search customers..."
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
          <p role="alert" className="mx-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {loadError}
          </p>
        ) : null}

        {!isLoading && !loadError && filteredCustomers.length > 0 ? (
          <ul className="px-4 pb-2">
            {filteredCustomers.map((customer) => (
              <li key={customer.id} className="mb-2 last:mb-0">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg bg-surface-container-lowest p-4 text-left ghost-shadow transition-all active:scale-[0.99]"
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
        ) : null}

        {showNoCustomersState ? (
          <section className="mx-4 mt-8 flex flex-col items-center rounded-lg bg-surface-container-lowest p-8 text-center ghost-shadow">
            <span className="material-symbols-outlined mb-2 text-5xl text-outline">group</span>
            <p className="text-sm text-outline">No customers yet.</p>
          </section>
        ) : null}

        {showNoSearchMatches ? (
          <section className="mx-4 mt-8 flex flex-col items-center rounded-lg bg-surface-container-lowest p-8 text-center ghost-shadow">
            <span className="material-symbols-outlined mb-2 text-5xl text-outline">group</span>
            <p className="text-sm text-outline">No customers match your search.</p>
          </section>
        ) : null}
      </section>

      <button
        type="button"
        aria-label="New customer"
        className="fixed right-4 bottom-20 z-50 flex h-14 w-14 items-center justify-center rounded-full forest-gradient text-white shadow-[0_0_24px_rgba(0,0,0,0.12)] transition-all active:scale-95"
        onClick={() => navigate("/customers/new")}
      >
        <span className="material-symbols-outlined">person_add</span>
      </button>

      <BottomNav active="customers" />
    </main>
  );
}
