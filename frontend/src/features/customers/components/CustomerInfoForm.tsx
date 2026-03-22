import type { ChangeEvent, FormEvent } from "react";

import { Button } from "@/shared/components/Button";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { Input } from "@/shared/components/Input";

interface CustomerInfoFormProps {
  name: string;
  phone: string;
  email: string;
  address: string;
  onNameChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPhoneChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onEmailChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onAddressChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  isSaving: boolean;
  saveError: string | null;
  saveSuccess: string | null;
}

export function CustomerInfoForm({
  name,
  phone,
  email,
  address,
  onNameChange,
  onPhoneChange,
  onEmailChange,
  onAddressChange,
  onSubmit,
  isSaving,
  saveError,
  saveSuccess,
}: CustomerInfoFormProps): React.ReactElement {
  return (
    <section className="rounded-xl bg-surface-container-lowest p-6 ghost-shadow">
      <h2 className="mb-4 text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
        Customer Info
      </h2>

      {saveSuccess ? (
        <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
          {saveSuccess}
        </p>
      ) : null}

      {saveError ? (
        <div className="mb-4">
          <FeedbackMessage variant="error">{saveError}</FeedbackMessage>
        </div>
      ) : null}

      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <Input id="customer-detail-name" label="Name" value={name} onChange={onNameChange} />
        <Input id="customer-detail-phone" label="Phone" value={phone} onChange={onPhoneChange} />
        <Input
          id="customer-detail-email"
          label="Email"
          type="email"
          value={email}
          onChange={onEmailChange}
        />

        <div className="flex flex-col gap-1">
          <label htmlFor="customer-detail-address" className="text-sm font-medium text-slate-700">
            Address
          </label>
          <textarea
            id="customer-detail-address"
            rows={4}
            value={address}
            onChange={onAddressChange}
            className="w-full rounded-lg bg-surface-container-high px-4 py-3 font-body text-sm text-on-surface placeholder:text-outline transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/30 focus:outline-none"
          />
        </div>

        <Button type="submit" variant="primary" className="mt-2 w-full" isLoading={isSaving}>
          Save Changes
        </Button>
      </form>
    </section>
  );
}
