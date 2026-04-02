import { useEffect, useState } from "react";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { getTimezoneOptions } from "@/features/profile/lib/timezones";
import { profileService } from "@/features/profile/services/profileService";
import {
  TRADE_TYPES,
  type ProfileResponse,
  type TradeType,
} from "@/features/profile/types/profile.types";
import { BottomNav } from "@/shared/components/BottomNav";
import { Button } from "@/shared/components/Button";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { Input } from "@/shared/components/Input";
import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { useTheme } from "@/shared/hooks/useTheme";
import { parseTaxPercentInput, toTaxPercentDisplay } from "@/shared/lib/pricing";
import type { ThemePreference } from "@/shared/lib/theme";

const THEME_OPTIONS: ReadonlyArray<{ label: string; value: ThemePreference }> = [
  { label: "System default", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];

export function SettingsScreen(): React.ReactElement {
  const { logout, refreshUser } = useAuth();
  const { preference: themePreference, setPreference: setThemePreference } = useTheme();
  const logoPreviewSrc = `${import.meta.env.VITE_API_URL ?? ""}/api/profile/logo`;

  const [businessName, setBusinessName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [tradeType, setTradeType] = useState<TradeType>(TRADE_TYPES[0]);
  const [timezone, setTimezone] = useState("UTC");
  const [defaultTaxRate, setDefaultTaxRate] = useState("");
  const [email, setEmail] = useState("");
  const [hasLogo, setHasLogo] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLogoSubmitting, setIsLogoSubmitting] = useState(false);
  const [isRemoveLogoOpen, setIsRemoveLogoOpen] = useState(false);
  const [isSignOutConfirmOpen, setIsSignOutConfirmOpen] = useState(false);
  const [logoPreviewVersion, setLogoPreviewVersion] = useState(0);

  function applyProfile(profile: ProfileResponse): void {
    setBusinessName(profile.business_name ?? "");
    setFirstName(profile.first_name ?? "");
    setLastName(profile.last_name ?? "");
    setTradeType(profile.trade_type ?? TRADE_TYPES[0]);
    setTimezone(profile.timezone ?? "UTC");
    setDefaultTaxRate(toTaxPercentDisplay(profile.default_tax_rate));
    setEmail(profile.email);
    setHasLogo(profile.has_logo);
  }

  useEffect(() => {
    let isActive = true;

    async function loadProfile(): Promise<void> {
      setIsLoadingProfile(true);
      setLoadError(null);

      try {
        const profile = await profileService.getProfile();
        if (isActive) {
          applyProfile(profile);
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

  const onLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setLogoError(null);
    setIsLogoSubmitting(true);

    try {
      const profile = await profileService.uploadLogo(file);
      applyProfile(profile);
      setLogoPreviewVersion((currentVersion) => currentVersion + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to upload logo";
      setLogoError(message);
    } finally {
      setIsLogoSubmitting(false);
    }
  };

  const onConfirmRemoveLogo = async () => {
    if (isLogoSubmitting) {
      return;
    }

    setLogoError(null);
    setIsLogoSubmitting(true);

    try {
      await profileService.deleteLogo();
      setHasLogo(false);
      setIsRemoveLogoOpen(false);
      setLogoPreviewVersion((currentVersion) => currentVersion + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to remove logo";
      setLogoError(message);
    } finally {
      setIsLogoSubmitting(false);
    }
  };

  const onConfirmSignOut = async () => {
    setIsSignOutConfirmOpen(false);
    await logout();
  };

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
        default_tax_rate: parseTaxPercentInput(defaultTaxRate),
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
      <ScreenHeader title="Settings" layout="top-level" />

      <section className="mx-auto w-full max-w-3xl space-y-4 px-4 pt-4">
        {isLoadingProfile ? (
          <p role="status" className="text-sm text-on-surface-variant">
            Loading settings...
          </p>
        ) : null}

        {!isLoadingProfile && loadError ? (
          <FeedbackMessage variant="error">{loadError}</FeedbackMessage>
        ) : null}

        {!isLoadingProfile && !loadError ? (
          <form className="space-y-4 pb-8" onSubmit={onSubmit}>
            {saveSuccess ? (
              <p role="status" className="rounded-lg bg-success-container p-3 text-sm text-success">
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
                <div
                  data-testid="settings-logo-row"
                  className="rounded-xl bg-surface-container-low p-4"
                >
                  <div
                    data-testid="settings-logo-row-grid"
                    className="grid grid-cols-[minmax(0,1fr)_120px] items-start gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-col gap-3">
                        <div className="space-y-1">
                          <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                            Logo
                          </p>
                          <p className="text-xs text-on-surface-variant">
                            JPEG or PNG, up to 2 MB. Appears on quote PDFs.
                          </p>
                        </div>

                        <div className="flex flex-col items-start gap-3">
                          <label
                            htmlFor="settings-logo-upload"
                            className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-4 py-3 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
                          >
                            Upload Logo
                          </label>
                          <input
                            id="settings-logo-upload"
                            type="file"
                            accept="image/jpeg,image/png"
                            className="sr-only"
                            disabled={isLogoSubmitting}
                            onChange={onLogoUpload}
                          />
                          {hasLogo ? (
                            <button
                              type="button"
                              className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-lg border border-secondary px-4 py-3 text-sm font-semibold text-secondary transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={isLogoSubmitting}
                              onClick={() => setIsRemoveLogoOpen(true)}
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>

                        {logoError ? <FeedbackMessage variant="error">{logoError}</FeedbackMessage> : null}
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <div
                        data-testid="settings-logo-preview-frame"
                        className="h-[84px] w-[120px] rounded-lg bg-surface-container-lowest"
                      >
                        {hasLogo ? (
                          <div className="flex h-full items-center justify-center p-3">
                            <img
                              key={logoPreviewVersion}
                              src={logoPreviewSrc}
                              alt="Business logo preview"
                              className="max-h-full max-w-full object-contain"
                            />
                          </div>
                        ) : (
                          <div className="flex h-full items-center justify-center p-3">
                            <p className="text-xs text-on-surface-variant">No logo</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <Input
                  id="settings-business-name"
                  label="Business name"
                  value={businessName}
                  onChange={(event) => setBusinessName(event.target.value)}
                />

                <div className="grid grid-cols-2 gap-4">
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
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="settings-trade-type" className="text-sm font-medium text-on-surface">
                      Trade type
                    </label>
                    <select
                      id="settings-trade-type"
                      value={tradeType}
                      onChange={(event) => setTradeType(event.target.value as TradeType)}
                      className="w-full rounded-lg bg-surface-container-high px-4 py-3 font-body text-sm text-on-surface transition-all focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      {TRADE_TYPES.map((tradeTypeOption) => (
                        <option key={tradeTypeOption} value={tradeTypeOption}>
                          {tradeTypeOption}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label htmlFor="settings-default-tax-rate" className="text-sm font-medium text-on-surface">
                      Tax rate (%)
                    </label>
                    <input
                      id="settings-default-tax-rate"
                      type="number"
                      step="0.01"
                      value={defaultTaxRate}
                      onChange={(event) => setDefaultTaxRate(event.target.value)}
                      className="w-full rounded-lg bg-surface-container-high px-4 py-3 font-body text-sm text-on-surface transition-all focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="8.25"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="settings-timezone" className="text-sm font-medium text-on-surface">
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

                <div className="flex flex-col gap-1">
                  <label htmlFor="settings-theme" className="text-sm font-medium text-on-surface">
                    Theme
                  </label>
                  <select
                    id="settings-theme"
                    value={themePreference}
                    onChange={(event) => setThemePreference(event.target.value as ThemePreference)}
                    className="w-full rounded-lg bg-surface-container-high px-4 py-3 font-body text-sm text-on-surface transition-all focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {THEME_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section className="rounded-xl bg-surface-container-low p-4">
              <h2 className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                Account
              </h2>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                    Email
                  </p>
                  <p className="truncate text-sm text-on-surface">{email}</p>
                </div>

                {/* Sign out is a compact filled terracotta button per Stitch, not the shared outlined destructive variant. */}
                <button
                  type="button"
                  className="shrink-0 cursor-pointer rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-on-secondary transition-all active:scale-[0.98]"
                  onClick={() => setIsSignOutConfirmOpen(true)}
                >
                  Sign Out
                </button>
              </div>
            </section>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                className="w-full md:min-w-[13rem] md:w-auto md:px-8"
                isLoading={isSubmitting}
              >
                Save Changes
              </Button>
            </div>
          </form>
        ) : null}
      </section>

      <BottomNav active="settings" />

      {isRemoveLogoOpen ? (
        <ConfirmModal
          title="Remove logo?"
          body="This will remove your logo from all future PDFs."
          confirmLabel="Remove"
          cancelLabel="Cancel"
          onConfirm={() => void onConfirmRemoveLogo()}
          onCancel={() => setIsRemoveLogoOpen(false)}
          variant="destructive"
        />
      ) : null}

      {isSignOutConfirmOpen ? (
        <ConfirmModal
          title="Sign out?"
          body="You'll need to sign back in to access your account."
          confirmLabel="Sign Out"
          cancelLabel="Cancel"
          onConfirm={() => void onConfirmSignOut()}
          onCancel={() => setIsSignOutConfirmOpen(false)}
          variant="destructive"
        />
      ) : null}
    </main>
  );
}
