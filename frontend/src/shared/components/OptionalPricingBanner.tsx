import { Banner } from "@/ui/Banner";

interface OptionalPricingBannerProps {
  message: string;
  onDismiss: () => void;
  dismissLabel?: string;
}

export function OptionalPricingBanner({
  message,
  onDismiss,
  dismissLabel = "Dismiss TBD pricing hint",
}: OptionalPricingBannerProps): React.ReactElement {
  return (
    <Banner
      kind="warn"
      title="Optional Pricing"
      message={message}
      onDismiss={onDismiss}
      dismissLabel={dismissLabel}
    />
  );
}
