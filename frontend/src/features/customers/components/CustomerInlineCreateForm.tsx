import type { ChangeEvent, FormEvent } from "react";

import { Button } from "@/shared/components/Button";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { Input } from "@/shared/components/Input";
import { CUSTOMER_ADDRESS_MAX_CHARS } from "@/shared/lib/inputLimits";

interface CustomerInlineCreateFormProps {
  name: string;
  phone: string;
  email: string;
  address: string;
  onNameChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPhoneChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onEmailChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onAddressChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onCancel: () => void;
  isCreating: boolean;
  error: string | null;
}

export function CustomerInlineCreateForm({
  name,
  phone,
  email,
  address,
  onNameChange,
  onPhoneChange,
  onEmailChange,
  onAddressChange,
  onSubmit,
  onCancel,
  isCreating,
  error,
}: CustomerInlineCreateFormProps): React.ReactElement {
  return (
    <section className="rounded-[var(--radius-document)] bg-surface-container-lowest p-6 ghost-shadow">
      {error ? (
        <div className="mb-4">
          <FeedbackMessage variant="error">{error}</FeedbackMessage>
        </div>
      ) : null}

      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <Input id="customer-name" label="Full Name" value={name} onChange={onNameChange} />
        <Input id="customer-phone" label="Phone Number" value={phone} onChange={onPhoneChange} />
        <Input
          id="customer-email"
          label="Email Address"
          type="email"
          value={email}
          onChange={onEmailChange}
        />

        <div className="flex flex-col gap-1">
          <label htmlFor="customer-address" className="text-sm font-medium text-on-surface-variant">
            Address
          </label>
          <textarea
            id="customer-address"
            rows={4}
            maxLength={CUSTOMER_ADDRESS_MAX_CHARS}
            value={address}
            onChange={onAddressChange}
            className="w-full rounded-[var(--radius-document)] bg-surface-container-high px-4 py-3 font-body text-sm text-on-surface placeholder:text-outline transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-focus-ring focus:outline-none"
          />
        </div>

        <Button type="submit" variant="primary" className="mt-2 w-full" isLoading={isCreating}>
          Create {"&"} Continue {">"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-start px-0"
          onClick={onCancel}
        >
          Back to search
        </Button>
      </form>
    </section>
  );
}
