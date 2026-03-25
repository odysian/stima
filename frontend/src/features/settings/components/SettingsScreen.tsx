import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { getTimezoneOptions } from "@/features/profile/lib/timezones";
import { profileService } from "@/features/profile/services/profileService";
import {
  TRADE_TYPES,
  type TradeType,
} from "@/features/profile/types/profile.types";
import { Button } from "@/shared/components/Button";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { Input } from "@/shared/components/Input";
import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { TradeTypeSelector } from "@/shared/components/TradeTypeSelector";

export function SettingsScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { logout, refreshUser } = useAuth();

  const [businessName, setBusinessName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [tradeType, setTradeType] = useState<TradeType>(TRADE_TYPES[0]);
  const [timezone, setTimezone] = useState("UTC");
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
          setTimezone(profile.timezone ?? "UTC");
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
        timezone,
      });
      try {
        await refreshUser();
      } catch {
        // Ignore refresh failures because profile save already succeeded.
      }
      setSaveSuccess("Saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save settings";
      setSaveError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background pb-24 pt-16">
      <ScreenHeader title="Settings" onBack={() => navigate(-1)} />

      <section className="mx-auto w-full max-w-2xl space-y-4 px-4 pt-4">
        {isLoadingProfile ? (
          <p role="status" className="text-sm text-on-surface-variant">
            Loading settings...
          </p>
        ) : null}

        {!isLoadingProfile && loadError ? (
          <FeedbackMessage variant="error">{loadError}</FeedbackMessage>
        ) : null}

        {!isLoadingProfile && !loadError ? (
          <form className="space-y-4" onSubmit={onSubmit}>
            {saveSuccess ? (
              <p role="status" className="rounded-md bg-success-container p-3 text-sm text-success">
                {saveSuccess}
              </p>
            ) : null}

            {saveError ? (
              <FeedbackMessage variant="error">{saveError}</FeedbackMessage>
            ) : null}

            <section className="ghost-shadow rounded-xl bg-surface-container-lowest p-6">
              <h2 className="mb-4 text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                Business Profile
              </h2>
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
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-sm font-medium text-on-surface">Trade type</legend>
                  <TradeTypeSelector
                    options={TRADE_TYPES}
                    value={tradeType}
                    onChange={(value) => setTradeType(value as TradeType)}
                  />
                </fieldset>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="settings-timezone"
                    className="text-sm font-medium text-on-surface"
                  >
                    Timezone
                  </label>
                  <select
                    id="settings-timezone"
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                    className="w-full rounded-lg bg-surface-container-high px-4 py-3 font-body text-sm text-on-surface transition-all focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {getTimezoneOptions(timezone).map((timezoneOption) => (
                      <option key={timezoneOption} value={timezoneOption}>
                        {timezoneOption}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section className="ghost-shadow rounded-xl bg-surface-container-lowest p-6">
              <h2 className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">Account</h2>
              <div className="mt-4 space-y-4">
                <div className="flex flex-col gap-1">
                  <p className="text-xs uppercase tracking-wide text-outline">Email</p>
                  <p className="text-sm text-on-surface">{email}</p>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-outline">Session</span>
                  {/* Sign out is a compact filled terracotta button per Stitch, not the shared outlined destructive variant. */}
                  <button
                    type="button"
                    className="rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-white transition-all active:scale-[0.98]"
                    onClick={() => void logout()}
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </section>

            <div>
              <Button type="submit" variant="primary" className="w-full" isLoading={isSubmitting}>
                Save Changes
              </Button>
            </div>
          </form>
        ) : null}
      </section>
    </main>
  );
}
