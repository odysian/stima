import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { customerService } from "@/features/customers/services/customerService";
import type { CustomerCreateRequest } from "@/features/customers/types/customer.types";
import { Button } from "@/shared/components/Button";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { Input } from "@/shared/components/Input";
import {
  ADDRESS_CITY_MAX_CHARS,
  ADDRESS_LINE_MAX_CHARS,
  ADDRESS_POSTAL_CODE_MAX_CHARS,
  ADDRESS_STATE_MAX_CHARS,
  PHONE_NUMBER_MAX_CHARS,
} from "@/shared/lib/inputLimits";
import { ScreenHeader } from "@/shared/components/ScreenHeader";

export function CustomerCreateScreen(): React.ReactElement {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
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
    if (addressLine1.trim()) payload.address_line1 = addressLine1.trim();
    if (addressLine2.trim()) payload.address_line2 = addressLine2.trim();
    if (city.trim()) payload.city = city.trim();
    if (state.trim()) payload.state = state.trim();
    if (postalCode.trim()) payload.postal_code = postalCode.trim();

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
      <ScreenHeader
        title="New Customer"
        backLabel="Back to customers"
        onBack={() => navigate("/customers")}
      />

      <section className="mx-auto w-full max-w-3xl px-4 pt-20">
        <section className="rounded-[var(--radius-document)] bg-surface-container-lowest p-6 ghost-shadow">
          {createError ? (
            <div className="mb-4">
              <FeedbackMessage variant="error">{createError}</FeedbackMessage>
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
              maxLength={PHONE_NUMBER_MAX_CHARS}
              onChange={(event) => setPhone(event.target.value)}
            />
            <Input
              id="customer-email"
              label="Email Address"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />

            <Input
              id="customer-address-line1"
              label="Address Line 1"
              value={addressLine1}
              maxLength={ADDRESS_LINE_MAX_CHARS}
              onChange={(event) => setAddressLine1(event.target.value)}
            />
            <Input
              id="customer-address-line2"
              label="Address Line 2"
              value={addressLine2}
              maxLength={ADDRESS_LINE_MAX_CHARS}
              onChange={(event) => setAddressLine2(event.target.value)}
            />
            <div className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-3">
              <Input
                id="customer-city"
                label="City"
                value={city}
                maxLength={ADDRESS_CITY_MAX_CHARS}
                onChange={(event) => setCity(event.target.value)}
              />
              <Input
                id="customer-state"
                label="State"
                value={state}
                maxLength={ADDRESS_STATE_MAX_CHARS}
                onChange={(event) => setState(event.target.value)}
              />
              <Input
                id="customer-postal-code"
                label="Postal Code"
                value={postalCode}
                maxLength={ADDRESS_POSTAL_CODE_MAX_CHARS}
                onChange={(event) => setPostalCode(event.target.value)}
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
