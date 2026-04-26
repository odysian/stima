import type { ChangeEvent } from "react";

import type { TradeType } from "@/features/profile/types/profile.types";
import { Button } from "@/shared/components/Button";
import { Input } from "@/shared/components/Input";
import type { ThemePreference } from "@/shared/lib/theme";
import { NumericField } from "@/ui/NumericField";
import { Select } from "@/ui/Select";
import { Card } from "@/ui/Card";
import { Eyebrow } from "@/ui/Eyebrow";

interface SettingsBusinessProfileCardProps {
  logoSizeLimitLabel: string;
  hasLogo: boolean;
  logoPreviewVersion: number;
  logoPreviewSrc: string;
  logoError: string | null;
  isLogoSubmitting: boolean;
  isEditingBusinessProfile: boolean;
  businessName: string;
  firstName: string;
  lastName: string;
  tradeType: TradeType;
  timezone: string;
  defaultTaxRate: string;
  themePreference: ThemePreference;
  tradeTypeOptions: readonly TradeType[];
  timezoneOptions: string[];
  themeOptions: ReadonlyArray<{ label: string; value: ThemePreference }>;
  logoUploadInputRef: React.RefObject<HTMLInputElement | null>;
  isSubmitting: boolean;
  onOpenEditor: () => void;
  onCancelEditor: () => void;
  onOpenRemoveLogo: () => void;
  onLogoUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onBusinessNameChange: (value: string) => void;
  onFirstNameChange: (value: string) => void;
  onLastNameChange: (value: string) => void;
  onTradeTypeChange: (value: TradeType) => void;
  onTaxRateChange: (value: string) => void;
  onTimezoneChange: (value: string) => void;
  onThemeChange: (value: ThemePreference) => void;
}

export function SettingsBusinessProfileCard({
  logoSizeLimitLabel,
  hasLogo,
  logoPreviewVersion,
  logoPreviewSrc,
  logoError,
  isLogoSubmitting,
  isEditingBusinessProfile,
  businessName,
  firstName,
  lastName,
  tradeType,
  timezone,
  defaultTaxRate,
  themePreference,
  tradeTypeOptions,
  timezoneOptions,
  themeOptions,
  logoUploadInputRef,
  isSubmitting,
  onOpenEditor,
  onCancelEditor,
  onOpenRemoveLogo,
  onLogoUpload,
  onBusinessNameChange,
  onFirstNameChange,
  onLastNameChange,
  onTradeTypeChange,
  onTaxRateChange,
  onTimezoneChange,
  onThemeChange,
}: SettingsBusinessProfileCardProps): React.ReactElement {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-3">
        <Eyebrow>Business Profile</Eyebrow>
        {!isEditingBusinessProfile ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-0 border border-outline-variant/30 px-3 py-1 text-xs text-on-surface"
            onClick={onOpenEditor}
            aria-label="Edit business profile"
          >
            Edit
          </Button>
        ) : null}
      </div>

      <div className="mt-2 flex flex-col gap-4">
        {isEditingBusinessProfile ? (
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
                  <div className="flex h-full w-full items-center justify-center rounded-[var(--radius-document)] bg-surface-container p-2">
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
                        onClick={onOpenRemoveLogo}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                  {logoError ? <p role="alert" className="text-xs text-error">{logoError}</p> : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {isEditingBusinessProfile ? (
          <>
            <Input
              id="settings-business-name"
              label="Business name"
              value={businessName}
              onChange={(event) => onBusinessNameChange(event.target.value)}
            />

            <div
              data-testid="settings-name-row"
              className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2"
            >
              <Input
                id="settings-first-name"
                label="First name"
                value={firstName}
                onChange={(event) => onFirstNameChange(event.target.value)}
              />
              <Input
                id="settings-last-name"
                label="Last name"
                value={lastName}
                onChange={(event) => onLastNameChange(event.target.value)}
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
                onChange={(event) => onTradeTypeChange(event.target.value as TradeType)}
              >
                {tradeTypeOptions.map((tradeTypeOption) => (
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
                onChange={onTaxRateChange}
                placeholder="8.25"
                showStepControls={false}
                formatOnBlur={false}
              />
            </div>

            <Select
              id="settings-timezone"
              label="Timezone"
              value={timezone}
              onChange={(event) => onTimezoneChange(event.target.value)}
            >
              {timezoneOptions.map((timezoneOption) => (
                <option key={timezoneOption} value={timezoneOption}>
                  {timezoneOption}
                </option>
              ))}
            </Select>

            <Select
              id="settings-theme"
              label="Theme"
              value={themePreference}
              onChange={(event) => onThemeChange(event.target.value as ThemePreference)}
            >
              {themeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>

            <div className="flex flex-col gap-2 pt-2 min-[360px]:flex-row min-[360px]:justify-end">
              <Button
                type="button"
                variant="ghost"
                className="min-[360px]:w-auto"
                onClick={onCancelEditor}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                className="min-[360px]:w-auto min-[360px]:px-8"
                isLoading={isSubmitting}
              >
                Save Changes
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-4" data-testid="settings-business-profile-display">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-document)] bg-surface-container-low">
                {hasLogo ? (
                  <img
                    key={logoPreviewVersion}
                    src={logoPreviewSrc}
                    alt="Business logo"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="material-symbols-outlined text-2xl text-on-surface-variant">business</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold text-on-surface">{businessName || "Not set"}</p>
                <p className="text-sm text-on-surface-variant">
                  {firstName} {lastName}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="text-on-surface-variant">
                <span className="text-on-surface">{tradeType}</span>
                <span className="mx-1.5 text-outline">·</span>
                {defaultTaxRate ? `${defaultTaxRate}% tax` : "No tax set"}
              </span>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="text-on-surface-variant">
                {timezone}
                <span className="mx-1.5 text-outline">·</span>
                {themeOptions.find((option) => option.value === themePreference)?.label ?? "System default"}
              </span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
