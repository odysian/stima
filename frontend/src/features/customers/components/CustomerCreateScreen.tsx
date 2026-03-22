import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { customerService } from "@/features/customers/services/customerService";
import type { CustomerCreateRequest } from "@/features/customers/types/customer.types";
import { Button } from "@/shared/components/Button";
import { Input } from "@/shared/components/Input";

export function CustomerCreateScreen(): React.ReactElement {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
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
      navigate(`/customers/${createdCustomer.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create customer";
      setCreateError(message);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <main className="min-h-screen bg-background pb-8">
      <header className="fixed top-0 z-50 flex w-full items-center gap-2 border-b border-outline-variant/40 bg-white/80 px-4 py-3 backdrop-blur-md">
        <button
          type="button"
          aria-label="Back to customers"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-on-surface transition hover:bg-surface-container"
          onClick={() => navigate("/customers")}
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="font-headline text-lg font-bold tracking-tight text-primary">New Customer</h1>
      </header>

      <section className="mx-auto w-full max-w-3xl px-4 pt-20">
        <section className="rounded-xl bg-surface-container-lowest p-6 ghost-shadow">
          {createError ? (
            <div role="alert" className="mb-4 rounded-lg border-l-4 border-error bg-error-container p-4">
              <p className="text-sm font-medium text-error">{createError}</p>
            </div>
          ) : null}

          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
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
              <label htmlFor="customer-address" className="text-sm font-medium text-slate-700">
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
              Create Customer {"->"}
            </Button>
          </form>
        </section>
      </section>
    </main>
  );
}
