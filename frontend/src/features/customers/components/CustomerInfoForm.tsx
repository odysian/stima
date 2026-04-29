import type { ChangeEvent, FormEvent } from "react";

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
import { Eyebrow } from "@/ui/Eyebrow";

interface CustomerInfoFormProps {
  name: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  onNameChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPhoneChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onEmailChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onAddressLine1Change: (event: ChangeEvent<HTMLInputElement>) => void;
  onAddressLine2Change: (event: ChangeEvent<HTMLInputElement>) => void;
  onCityChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onStateChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPostalCodeChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onCancel?: () => void;
  isSaving: boolean;
  saveError: string | null;
}

export function CustomerInfoForm({
  name,
  phone,
  email,
  addressLine1,
  addressLine2,
  city,
  state,
  postalCode,
  onNameChange,
  onPhoneChange,
  onEmailChange,
  onAddressLine1Change,
  onAddressLine2Change,
  onCityChange,
  onStateChange,
  onPostalCodeChange,
  onSubmit,
  onCancel,
  isSaving,
  saveError,
}: CustomerInfoFormProps): React.ReactElement {
  return (
    <section className="rounded-[var(--radius-document)] bg-surface-container-lowest p-6 ghost-shadow">
      <Eyebrow className="mb-4">Customer Info</Eyebrow>

      {saveError ? (
        <div className="mb-4">
          <FeedbackMessage variant="error">{saveError}</FeedbackMessage>
        </div>
      ) : null}

      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <Input id="customer-detail-name" label="Name" value={name} onChange={onNameChange} />
        <Input
          id="customer-detail-phone"
          label="Phone"
          value={phone}
          maxLength={PHONE_NUMBER_MAX_CHARS}
          onChange={onPhoneChange}
        />
        <Input
          id="customer-detail-email"
          label="Email"
          type="email"
          value={email}
          onChange={onEmailChange}
        />
        <Input
          id="customer-detail-address-line1"
          label="Address Line 1"
          value={addressLine1}
          maxLength={ADDRESS_LINE_MAX_CHARS}
          onChange={onAddressLine1Change}
        />
        <Input
          id="customer-detail-address-line2"
          label="Address Line 2"
          value={addressLine2}
          maxLength={ADDRESS_LINE_MAX_CHARS}
          onChange={onAddressLine2Change}
        />
        <div className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-3">
          <Input
            id="customer-detail-city"
            label="City"
            value={city}
            maxLength={ADDRESS_CITY_MAX_CHARS}
            onChange={onCityChange}
          />
          <Input
            id="customer-detail-state"
            label="State"
            value={state}
            maxLength={ADDRESS_STATE_MAX_CHARS}
            onChange={onStateChange}
          />
          <Input
            id="customer-detail-postal-code"
            label="Postal Code"
            value={postalCode}
            maxLength={ADDRESS_POSTAL_CODE_MAX_CHARS}
            onChange={onPostalCodeChange}
          />
        </div>

        <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {onCancel ? (
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={onCancel}
              disabled={isSaving}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
          ) : null}

          <Button type="submit" variant="primary" className="w-full px-6 sm:w-auto" isLoading={isSaving}>
            Save Changes
          </Button>
        </div>
      </form>
    </section>
  );
}
