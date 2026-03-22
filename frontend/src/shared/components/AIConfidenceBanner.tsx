interface AIConfidenceBannerProps {
  message: string;
}

export function AIConfidenceBanner({ message }: AIConfidenceBannerProps): React.ReactElement {
  return (
    <div className="rounded-lg border-l-4 border-warning-accent bg-warning-container p-4 backdrop-blur-md shadow-[0_0_24px_rgba(0,0,0,0.04)]">
      <div className="flex gap-3">
        <span
          className="material-symbols-outlined text-warning-accent"
          style={{ fontVariationSettings: '"FILL" 1, "wght" 400, "GRAD" 0, "opsz" 24' }}
        >
          info
        </span>
        <div>
          <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-warning">AI Confidence Note</p>
          <p className="text-sm font-medium leading-snug text-warning">{message}</p>
        </div>
      </div>
    </div>
  );
}
