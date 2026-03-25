import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { detectBrowserTimezone } from "@/features/profile/lib/timezones";
import { profileService } from "@/features/profile/services/profileService";
import {
  TRADE_TYPES,
  type TradeType,
} from "@/features/profile/types/profile.types";
import { Button } from "@/shared/components/Button";
import { Input } from "@/shared/components/Input";
import { TradeTypeSelector } from "@/shared/components/TradeTypeSelector";

export function OnboardingForm(): React.ReactElement {
  const { refreshUser } = useAuth();
  const navigate = useNavigate();

  const [businessName, setBusinessName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [tradeType, setTradeType] = useState<TradeType>(TRADE_TYPES[0]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await profileService.updateProfile({
        business_name: businessName,
        first_name: firstName,
        last_name: lastName,
        trade_type: tradeType,
        timezone: detectBrowserTimezone(),
      });
      await refreshUser();
      navigate("/", { replace: true });
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Onboarding failed";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
      <h1 className="mb-8 font-headline text-3xl font-bold text-primary">Stima</h1>
      <section className="w-full max-w-sm rounded-xl bg-surface-container-lowest p-6 ghost-shadow">
        <h2 className="font-headline text-2xl font-bold text-on-surface">Set up your business</h2>
        <p className="mb-6 mt-2 text-sm text-on-surface-variant">
          Tell us a bit about your work so we can tailor your quotes.
        </p>
        {error ? (
          <div role="alert" className="mb-4 rounded-lg border-l-4 border-error bg-error-container p-4">
            <p className="text-sm font-medium text-error">{error}</p>
          </div>
        ) : null}

        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <div className="flex flex-col gap-1">
            <label htmlFor="business-name" className="flex items-center justify-between text-sm font-medium text-on-surface-variant">
              <span>Business name</span>
              <span className="text-xs font-medium text-error">* required</span>
            </label>
            <Input
              id="business-name"
              required
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Input
              id="first-name"
              label="First name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
            <Input
              id="last-name"
              label="Last name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-on-surface-variant">Trade type</legend>
            <TradeTypeSelector
              options={TRADE_TYPES}
              value={tradeType}
              onChange={(value) => setTradeType(value as TradeType)}
            />
          </fieldset>

          <Button type="submit" isLoading={isSubmitting} className="w-full">
            Continue →
          </Button>
        </form>
      </section>
    </main>
  );
}
