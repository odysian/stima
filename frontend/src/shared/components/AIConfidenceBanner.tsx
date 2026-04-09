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
    <div className="ghost-shadow rounded-lg border-l-4 border-warning-accent bg-warning-container p-4 backdrop-blur-md">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-warning">AI Confidence Note</p>
          <p className="text-sm font-medium leading-snug text-warning">{message}</p>
        </div>
        {onDismiss ? (
          <button
            type="button"
            aria-label={dismissLabel}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-warning transition-colors hover:bg-warning/10"
            onClick={onDismiss}
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
