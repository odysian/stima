interface AIConfidenceBannerProps {
  message: string;
}

export function AIConfidenceBanner({ message }: AIConfidenceBannerProps): React.ReactElement {
  return (
    <div className="bg-amber-500/10 border-l-4 border-amber-500 rounded-lg p-4 backdrop-blur-md shadow-[0_0_24px_rgba(0,0,0,0.04)]">
      <div className="flex gap-3">
        <span className="material-symbols-outlined text-amber-600" style={{ fontVariationSettings: '"FILL" 1' }}>
          info
        </span>
        <div>
          <p className="text-[0.6875rem] font-bold text-amber-800 uppercase tracking-wider">AI Confidence Note</p>
          <p className="text-sm font-medium text-amber-900 leading-snug">{message}</p>
        </div>
      </div>
    </div>
  );
}
