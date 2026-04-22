import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { getTimezoneOptions } from "@/features/profile/lib/timezones";
import { profileService } from "@/features/profile/services/profileService";
import { SettingsCatalogShortcutCard } from "@/features/settings/components/SettingsCatalogShortcutCard";
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
import { formatByteLimit } from "@/shared/lib/formatters";
import { MAX_LOGO_SIZE_BYTES } from "@/shared/lib/inputLimits";
import { parseTaxPercentInput, toTaxPercentDisplay } from "@/shared/lib/pricing";
import type { ThemePreference } from "@/shared/lib/theme";
import { NumericField } from "@/ui/NumericField";
import { Select } from "@/ui/Select";
import { useToast } from "@/ui/Toast";
import { Card } from "@/ui/Card";
import { Eyebrow } from "@/ui/Eyebrow";

const THEME_OPTIONS: ReadonlyArray<{ label: string; value: ThemePreference }> = [
  { label: "System default", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];

export function SettingsScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { show } = useToast();
  const { logout, refreshUser } = useAuth();
  const { preference: themePreference, setPreference: setThemePreference } = useTheme();
  const logoPreviewSrc = `${import.meta.env.VITE_API_URL ?? ""}/api/profile/logo`;
  const logoSizeLimitLabel = formatByteLimit(MAX_LOGO_SIZE_BYTES);
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
  const logoUploadInputRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    if (!saveSuccess) {
      return;
    }
    show({ message: saveSuccess, variant: "success" });
    setSaveSuccess(null);
  }, [saveSuccess, show]);

  const onLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setLogoError(`Logo must be ${logoSizeLimitLabel} or smaller.`);
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
            {saveError ? (
              <FeedbackMessage variant="error">{saveError}</FeedbackMessage>
            ) : null}

            <Card className="p-6">
              <Eyebrow className="mb-4">Business Profile</Eyebrow>

              <div className="mt-4 flex flex-col gap-4">
                <div
                  data-testid="settings-logo-block"
                  className="rounded-[var(--radius-document)] bg-surface-container-low p-4"
                >
                  <div className="flex flex-col gap-3">
                    <Eyebrow>Logo</Eyebrow>
                    <div
                      data-testid="settings-logo-content-row"
                      className="flex flex-col gap-3 min-[360px]:grid min-[360px]:grid-cols-[128px_minmax(0,1fr)] min-[360px]:items-start min-[360px]:gap-4"
                    >
                      <div
                        data-testid="settings-logo-preview-tile"
                        className="flex h-[128px] w-[128px] rounded-[var(--radius-document)] bg-surface-container-lowest p-2"
                      >
                        <div className="flex h-full w-full items-center justify-center rounded-lg bg-surface-container p-2">
                          {hasLogo ? (
                            <img
                              key={logoPreviewVersion}
                              src={logoPreviewSrc}
                              alt="Business logo preview"
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <p className="text-xs text-on-surface-variant">No logo</p>
                          )}
                        </div>
                      </div>

                      <div
                        data-testid="settings-logo-actions"
                        className="flex min-w-0 flex-col gap-2"
                      >
                        <p className="text-xs text-on-surface-variant">
                          {`JPEG or PNG, up to ${logoSizeLimitLabel}. Appears on quote PDFs.`}
                        </p>
                        <div className="flex flex-col items-start gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="min-h-10 border border-outline-variant/30 px-3 text-xs text-on-surface"
                            disabled={isLogoSubmitting}
                            onClick={() => logoUploadInputRef.current?.click()}
                          >
                            Upload Logo
                          </Button>
                          <input
                            ref={logoUploadInputRef}
                            id="settings-logo-upload"
                            aria-label="Upload logo"
                            type="file"
                            accept="image/jpeg,image/png"
                            className="sr-only"
                            disabled={isLogoSubmitting}
                            onChange={onLogoUpload}
                          />
                          {hasLogo ? (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              className="min-h-10 px-3 text-xs"
                              disabled={isLogoSubmitting}
                              onClick={() => setIsRemoveLogoOpen(true)}
                            >
                              Remove
                            </Button>
                          ) : null}
                        </div>
                        {logoError ? <FeedbackMessage variant="error">{logoError}</FeedbackMessage> : null}
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

                <div
                  data-testid="settings-name-row"
                  className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2"
                >
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

                <div
                  data-testid="settings-profile-meta-row"
                  className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2"
                >
                  <Select
                    id="settings-trade-type"
                    label="Trade type"
                    value={tradeType}
                    onChange={(event) => setTradeType(event.target.value as TradeType)}
                  >
                    {TRADE_TYPES.map((tradeTypeOption) => (
                      <option key={tradeTypeOption} value={tradeTypeOption}>
                        {tradeTypeOption}
                      </option>
                    ))}
                  </Select>

                  <NumericField
                    id="settings-default-tax-rate"
                    label="Tax rate (%)"
                    step={0.01}
                    value={defaultTaxRate}
                    onChange={setDefaultTaxRate}
                    placeholder="8.25"
                    showStepControls={false}
                    formatOnBlur={false}
                  />
                </div>

                <Select
                  id="settings-timezone"
                  label="Timezone"
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                >
                  {getTimezoneOptions(timezone).map((timezoneOption) => (
                    <option key={timezoneOption} value={timezoneOption}>
                      {timezoneOption}
                    </option>
                  ))}
                </Select>

                <Select
                  id="settings-theme"
                  label="Theme"
                  value={themePreference}
                  onChange={(event) => setThemePreference(event.target.value as ThemePreference)}
                >
                  {THEME_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
            </Card>

            <SettingsCatalogShortcutCard
              onOpenLineItemCatalog={() => navigate("/settings/line-item-catalog")}
            />

            <Card className="bg-surface-container-low p-4">
              <Eyebrow>Account</Eyebrow>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Eyebrow>Email</Eyebrow>
                  <p className="truncate text-sm text-on-surface">{email}</p>
                </div>

                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="shrink-0 px-4"
                  onClick={() => setIsSignOutConfirmOpen(true)}
                >
                  Sign Out
                </Button>
              </div>
            </Card>

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
