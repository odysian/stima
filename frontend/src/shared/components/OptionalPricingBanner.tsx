import { Button } from "@/shared/components/Button";

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
    <div className="flex items-start justify-between gap-3 rounded-lg border border-warning/20 bg-warning-container px-3 py-2 text-xs text-warning">
      <p>{message}</p>
      <Button
        type="button"
        variant="iconButton"
        size="xs"
        aria-label={dismissLabel}
        onClick={onDismiss}
        className="shrink-0 text-warning hover:bg-warning/10"
      >
        <span className="material-symbols-outlined text-base">close</span>
      </Button>
    </div>
  );
}
