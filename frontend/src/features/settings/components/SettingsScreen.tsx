import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { getTimezoneOptions } from "@/features/profile/lib/timezones";
import { profileService } from "@/features/profile/services/profileService";
import { SettingsBusinessProfileCard } from "@/features/settings/components/SettingsBusinessProfileCard";
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
import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { useTheme } from "@/shared/hooks/useTheme";
import { formatByteLimit } from "@/shared/lib/formatters";
import { MAX_LOGO_SIZE_BYTES } from "@/shared/lib/inputLimits";
import { parseTaxPercentInput, toTaxPercentDisplay } from "@/shared/lib/pricing";
import type { ThemePreference } from "@/shared/lib/theme";
import { useToast } from "@/ui/Toast";
import { Card } from "@/ui/Card";
import { Eyebrow } from "@/ui/Eyebrow";

const THEME_OPTIONS: ReadonlyArray<{ label: string; value: ThemePreference }> = [
  { label: "System default", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];

interface BusinessProfileDraft {
  businessName: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  businessAddressLine1: string;
  businessAddressLine2: string;
  businessCity: string;
  businessState: string;
  businessPostalCode: string;
  tradeType: TradeType;
  timezone: string;
  defaultTaxRate: string;
}

function normalizeOptionalText(value: string): string | null {
  const trimmedValue = value.trim();
  return trimmedValue || null;
}

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
  const [phoneNumber, setPhoneNumber] = useState("");
  const [businessAddressLine1, setBusinessAddressLine1] = useState("");
  const [businessAddressLine2, setBusinessAddressLine2] = useState("");
  const [businessCity, setBusinessCity] = useState("");
  const [businessState, setBusinessState] = useState("");
  const [businessPostalCode, setBusinessPostalCode] = useState("");
  const [formattedAddress, setFormattedAddress] = useState<string | null>(null);
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
  const [savedProfileDraft, setSavedProfileDraft] = useState<BusinessProfileDraft | null>(null);
  const [isEditingBusinessProfile, setIsEditingBusinessProfile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLogoSubmitting, setIsLogoSubmitting] = useState(false);
  const [isRemoveLogoOpen, setIsRemoveLogoOpen] = useState(false);
  const [isSignOutConfirmOpen, setIsSignOutConfirmOpen] = useState(false);
  const [logoPreviewVersion, setLogoPreviewVersion] = useState(0);
  const logoUploadInputRef = useRef<HTMLInputElement>(null);

  const applyDraft = useCallback((draft: BusinessProfileDraft): void => {
    setBusinessName(draft.businessName);
    setFirstName(draft.firstName);
    setLastName(draft.lastName);
    setPhoneNumber(draft.phoneNumber);
    setBusinessAddressLine1(draft.businessAddressLine1);
    setBusinessAddressLine2(draft.businessAddressLine2);
    setBusinessCity(draft.businessCity);
    setBusinessState(draft.businessState);
    setBusinessPostalCode(draft.businessPostalCode);
    setTradeType(draft.tradeType);
    setTimezone(draft.timezone);
    setDefaultTaxRate(draft.defaultTaxRate);
  }, []);

  const toDraft = useCallback((profile: ProfileResponse): BusinessProfileDraft => {
    return {
      businessName: profile.business_name ?? "",
      firstName: profile.first_name ?? "",
      lastName: profile.last_name ?? "",
      phoneNumber: profile.phone_number ?? "",
      businessAddressLine1: profile.business_address_line1 ?? "",
      businessAddressLine2: profile.business_address_line2 ?? "",
      businessCity: profile.business_city ?? "",
      businessState: profile.business_state ?? "",
      businessPostalCode: profile.business_postal_code ?? "",
      tradeType: profile.trade_type ?? TRADE_TYPES[0],
      timezone: profile.timezone ?? "UTC",
      defaultTaxRate: toTaxPercentDisplay(profile.default_tax_rate),
    };
  }, []);

  const applyProfile = useCallback((profile: ProfileResponse): void => {
    const nextDraft = toDraft(profile);
    applyDraft(nextDraft);
    setSavedProfileDraft(nextDraft);
    setEmail(profile.email);
    setHasLogo(profile.has_logo);
    setFormattedAddress(profile.formatted_address);
  }, [applyDraft, toDraft]);

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
  }, [applyProfile]);

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

  const openBusinessProfileEditor = () => {
    if (savedProfileDraft) {
      applyDraft(savedProfileDraft);
    }
    setSaveError(null);
    setIsEditingBusinessProfile(true);
  };

  const cancelBusinessProfileEditor = () => {
    if (savedProfileDraft) {
      applyDraft(savedProfileDraft);
    }
    setSaveError(null);
    setLogoError(null);
    setIsEditingBusinessProfile(false);
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveError(null);
    setSaveSuccess(null);
    setIsSubmitting(true);
    try {
      const updatedProfile = await profileService.updateProfile({
        business_name: businessName,
        first_name: firstName,
        last_name: lastName,
        phone_number: normalizeOptionalText(phoneNumber),
        business_address_line1: normalizeOptionalText(businessAddressLine1),
        business_address_line2: normalizeOptionalText(businessAddressLine2),
        business_city: normalizeOptionalText(businessCity),
        business_state: normalizeOptionalText(businessState),
        business_postal_code: normalizeOptionalText(businessPostalCode),
        trade_type: tradeType,
        timezone,
        default_tax_rate: parseTaxPercentInput(defaultTaxRate),
      });
      setFormattedAddress(updatedProfile.formatted_address);
      try {
        await refreshUser();
      } catch {
        // Ignore refresh failures because profile save already succeeded.
      }
      setSavedProfileDraft({
        businessName,
        firstName,
        lastName,
        phoneNumber,
        businessAddressLine1,
        businessAddressLine2,
        businessCity,
        businessState,
        businessPostalCode,
        tradeType,
        timezone,
        defaultTaxRate,
      });
      setIsEditingBusinessProfile(false);
      setSaveSuccess("Saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save settings";
      setSaveError(message);
    } finally {
      setIsSubmitting(false);
    }
  };
  const timezoneOptions = getTimezoneOptions(timezone);

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

            <SettingsBusinessProfileCard
              logoSizeLimitLabel={logoSizeLimitLabel}
              hasLogo={hasLogo}
              logoPreviewVersion={logoPreviewVersion}
              logoPreviewSrc={logoPreviewSrc}
              logoError={logoError}
              isLogoSubmitting={isLogoSubmitting}
              isEditingBusinessProfile={isEditingBusinessProfile}
              businessName={businessName}
              firstName={firstName}
              lastName={lastName}
              phoneNumber={phoneNumber}
              businessAddressLine1={businessAddressLine1}
              businessAddressLine2={businessAddressLine2}
              businessCity={businessCity}
              businessState={businessState}
              businessPostalCode={businessPostalCode}
              formattedAddress={formattedAddress}
              tradeType={tradeType}
              timezone={timezone}
              defaultTaxRate={defaultTaxRate}
              themePreference={themePreference}
              tradeTypeOptions={TRADE_TYPES}
              timezoneOptions={timezoneOptions}
              themeOptions={THEME_OPTIONS}
              logoUploadInputRef={logoUploadInputRef}
              isSubmitting={isSubmitting}
              onOpenEditor={openBusinessProfileEditor}
              onCancelEditor={cancelBusinessProfileEditor}
              onOpenRemoveLogo={() => setIsRemoveLogoOpen(true)}
              onLogoUpload={onLogoUpload}
              onBusinessNameChange={setBusinessName}
              onFirstNameChange={setFirstName}
              onLastNameChange={setLastName}
              onPhoneNumberChange={setPhoneNumber}
              onBusinessAddressLine1Change={setBusinessAddressLine1}
              onBusinessAddressLine2Change={setBusinessAddressLine2}
              onBusinessCityChange={setBusinessCity}
              onBusinessStateChange={setBusinessState}
              onBusinessPostalCodeChange={setBusinessPostalCode}
              onTradeTypeChange={setTradeType}
              onTaxRateChange={setDefaultTaxRate}
              onTimezoneChange={setTimezone}
              onThemeChange={setThemePreference}
            />

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
