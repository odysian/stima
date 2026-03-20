import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { customerService } from "@/features/customers/services/customerService";
import type {
  Customer,
  CustomerCreateRequest,
} from "@/features/customers/types/customer.types";
import { Button } from "@/shared/components/Button";
import { Input } from "@/shared/components/Input";

type ScreenMode = "search" | "create";

export function CustomerSelectScreen(): React.ReactElement {
  const navigate = useNavigate();
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

  function onCancelCreate(): void {
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

  if (mode === "create") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <section className="w-full max-w-xl rounded-xl bg-white p-6 shadow-sm">
          <h1 className="mb-6 text-2xl font-semibold text-slate-900">Add new customer</h1>
          {createError ? (
            <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
              {createError}
            </p>
          ) : null}

          <form className="flex flex-col gap-4" onSubmit={onCreateCustomer}>
            <Input
              id="customer-name"
              label="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Input
              id="customer-phone"
              label="Phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
            <Input
              id="customer-email"
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />

            <div className="flex flex-col gap-1">
              <label htmlFor="customer-address" className="text-sm font-medium text-slate-700">
                Address
              </label>
              <textarea
                id="customer-address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                rows={3}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" isLoading={isCreating}>
                Create customer
              </Button>
              <Button type="button" onClick={onCancelCreate}>
                Cancel
              </Button>
            </div>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <section className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-2xl font-semibold text-slate-900">Select customer</h1>

        <Input
          id="customer-search"
          label="Search customers"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        {loading ? <p role="status" className="mt-4 text-sm text-slate-600">Loading customers...</p> : null}
        {loadError ? (
          <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {loadError}
          </p>
        ) : null}

        {!loading && !loadError ? (
          <div className="mt-4 flex flex-col gap-2">
            {filteredCustomers.length > 0 ? (
              filteredCustomers.map((customer) => {
                const subtitle = [customer.phone, customer.email].filter(Boolean).join(" · ");
                return (
                  <button
                    key={customer.id}
                    type="button"
                    className="w-full rounded-md border border-slate-200 px-4 py-3 text-left transition hover:border-slate-400 hover:bg-slate-50"
                    onClick={() => onSelectCustomer(customer.id)}
                  >
                    <p className="text-sm font-semibold text-slate-900">{customer.name}</p>
                    {subtitle ? <p className="text-xs text-slate-600">{subtitle}</p> : null}
                  </button>
                );
              })
            ) : (
              <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
                No customers found. Create one to continue.
              </p>
            )}
          </div>
        ) : null}

        <div className="mt-6">
          <Button type="button" onClick={onSwitchToCreateMode}>
            Add new customer
          </Button>
        </div>
      </section>
    </main>
  );
}
