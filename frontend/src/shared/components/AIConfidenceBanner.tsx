import { Banner } from "@/ui/Banner";

interface AIConfidenceBannerProps {
  message: string;
  onDismiss?: () => void;
  dismissLabel?: string;
}

export function AIConfidenceBanner({
  message,
  onDismiss,
  dismissLabel = "Dismiss confidence note",
}: AIConfidenceBannerProps): React.ReactElement {
  return (
    <Banner
      kind="warn"
      title="AI Confidence Note"
      message={message}
      onDismiss={onDismiss}
      dismissLabel={dismissLabel}
    />
  );
}
