import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { profileService } from "@/features/profile/services/profileService";
import {
  TRADE_TYPES,
  type TradeType,
} from "@/features/profile/types/profile.types";
import { Button } from "@/shared/components/Button";
import { Input } from "@/shared/components/Input";

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
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <section className="w-full max-w-md rounded-xl bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-2xl font-semibold text-slate-900">Complete your business profile</h1>
        {error ? (
          <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <Input
            id="business-name"
            label="Business name"
            value={businessName}
            onChange={(event) => setBusinessName(event.target.value)}
          />
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

          <div className="flex flex-col gap-1">
            <label htmlFor="trade-type" className="text-sm font-medium text-slate-700">
              Trade type
            </label>
            <select
              id="trade-type"
              value={tradeType}
              onChange={(event) => setTradeType(event.target.value as TradeType)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            >
              {TRADE_TYPES.map((tradeOption) => (
                <option key={tradeOption} value={tradeOption}>
                  {tradeOption}
                </option>
              ))}
            </select>
          </div>

          <Button type="submit" isLoading={isSubmitting}>
            Continue
          </Button>
        </form>
      </section>
    </main>
  );
}
