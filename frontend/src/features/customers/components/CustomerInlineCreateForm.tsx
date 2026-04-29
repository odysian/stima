import type { ChangeEvent, FormEvent } from "react";

import { Button } from "@/shared/components/Button";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { Input } from "@/shared/components/Input";
import {
  ADDRESS_CITY_MAX_CHARS,
  ADDRESS_LINE_MAX_CHARS,
  ADDRESS_POSTAL_CODE_MAX_CHARS,
  PHONE_NUMBER_MAX_CHARS,
} from "@/shared/lib/inputLimits";
import { US_STATE_OPTIONS } from "@/shared/lib/usStates";
import { Select } from "@/ui/Select";

interface CustomerInlineCreateFormProps {
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
  onStateChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onPostalCodeChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onCancel: () => void;
  isCreating: boolean;
  error: string | null;
}

export function CustomerInlineCreateForm({
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
        <Input
          id="customer-phone"
          label="Phone Number"
          value={phone}
          maxLength={PHONE_NUMBER_MAX_CHARS}
          onChange={onPhoneChange}
        />
        <Input
          id="customer-email"
          label="Email Address"
          type="email"
          value={email}
          onChange={onEmailChange}
        />

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-on-surface">Address</p>
          <Input
            id="customer-address-line1"
            label="Street address or P.O. Box"
            hideLabel
            placeholder="Street address or P.O. Box"
            value={addressLine1}
            maxLength={ADDRESS_LINE_MAX_CHARS}
            onChange={onAddressLine1Change}
          />
          <Input
            id="customer-address-line2"
            label="Apt, suite, unit, building (optional)"
            hideLabel
            placeholder="Apt, suite, unit, building (optional)"
            value={addressLine2}
            maxLength={ADDRESS_LINE_MAX_CHARS}
            onChange={onAddressLine2Change}
          />
        </div>
        <Input
          id="customer-city"
          label="City"
          value={city}
          maxLength={ADDRESS_CITY_MAX_CHARS}
          onChange={onCityChange}
        />
        <div className="grid grid-cols-[minmax(96px,120px)_minmax(0,1fr)] gap-4">
          <Select id="customer-state" label="State" value={state} onChange={onStateChange}>
            <option value="">Select</option>
            {US_STATE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Input
            id="customer-postal-code"
            label="ZIP code"
            placeholder="ZIP code"
            value={postalCode}
            maxLength={ADDRESS_POSTAL_CODE_MAX_CHARS}
            onChange={onPostalCodeChange}
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
