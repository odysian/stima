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
      <button
        type="button"
        aria-label={dismissLabel}
        onClick={onDismiss}
        className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-warning transition-colors hover:bg-warning/10"
      >
        <span className="material-symbols-outlined text-base">close</span>
      </button>
    </div>
  );
}
