import { useEffect, useState } from "react";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { profileService } from "@/features/profile/services/profileService";
import {
  TRADE_TYPES,
  type TradeType,
} from "@/features/profile/types/profile.types";
import { Button } from "@/shared/components/Button";
import { Input } from "@/shared/components/Input";

export function SettingsScreen(): React.ReactElement {
  const { logout, refreshUser } = useAuth();

  const [businessName, setBusinessName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [tradeType, setTradeType] = useState<TradeType>(TRADE_TYPES[0]);
  const [email, setEmail] = useState("");
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function loadProfile(): Promise<void> {
      setIsLoadingProfile(true);
      setLoadError(null);

      try {
        const profile = await profileService.getProfile();
        if (isActive) {
          setBusinessName(profile.business_name ?? "");
          setFirstName(profile.first_name ?? "");
          setLastName(profile.last_name ?? "");
          setTradeType(profile.trade_type ?? TRADE_TYPES[0]);
          setEmail(profile.email);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load settings";
        if (isActive) {
          setLoadError(message);
        }
      } finally {
        if (isActive) {
          setIsLoadingProfile(false);
        }
      }
    }

    void loadProfile();

    return () => {
      isActive = false;
    };
  }, []);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveError(null);
    setSaveSuccess(null);
    setIsSubmitting(true);

    try {
      await profileService.updateProfile({
        business_name: businessName,
        first_name: firstName,
        last_name: lastName,
        trade_type: tradeType,
      });
      await refreshUser();
      setSaveSuccess("Saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save settings";
      setSaveError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100">
      <section className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>

        {isLoadingProfile ? (
          <p role="status" className="mt-4 text-sm text-slate-700">
            Loading settings...
          </p>
        ) : null}

        {!isLoadingProfile && loadError ? (
          <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {loadError}
          </p>
        ) : null}

        {!isLoadingProfile && !loadError ? (
          <form className="mt-6 flex flex-col gap-6" onSubmit={onSubmit}>
            {saveSuccess ? (
              <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
                {saveSuccess}
              </p>
            ) : null}

            {saveError ? (
              <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                {saveError}
              </p>
            ) : null}

            <section className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Business profile</h2>
              <div className="mt-4 flex flex-col gap-4">
                <Input
                  id="settings-business-name"
                  label="Business name"
                  value={businessName}
                  onChange={(event) => setBusinessName(event.target.value)}
                />
                <Input
                  id="settings-first-name"
                  label="First name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                />
                <Input
                  id="settings-last-name"
                  label="Last name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                />
                <div className="flex flex-col gap-1">
                  <label htmlFor="settings-trade-type" className="text-sm font-medium text-slate-700">
                    Trade type
                  </label>
                  <select
                    id="settings-trade-type"
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
              </div>
            </section>

            <section className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Account</h2>
              <div className="mt-4 space-y-4">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-slate-700">Email</p>
                  <p className="text-sm text-slate-900">{email}</p>
                </div>
                <Button type="button" onClick={() => void logout()}>
                  Sign Out
                </Button>
              </div>
            </section>

            <div>
              <Button type="submit" isLoading={isSubmitting}>
                Save changes
              </Button>
            </div>
          </form>
        ) : null}
      </section>
    </main>
  );
}
