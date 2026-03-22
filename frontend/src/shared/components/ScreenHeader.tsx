import type { ReactNode } from "react";

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  trailing?: ReactNode;
}

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  trailing,
}: ScreenHeaderProps): React.ReactElement {
  return (
    <header className="fixed top-0 z-50 h-16 w-full bg-white/80 backdrop-blur-md shadow-[0_0_24px_rgba(13,28,46,0.04)]">
      <div className="flex h-16 items-center gap-3 px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="rounded-full p-2 text-emerald-900 transition-all hover:bg-slate-50 active:scale-95"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-headline text-lg font-bold tracking-tight text-on-surface">{title}</h1>
          {subtitle ? <p className="truncate text-xs text-on-surface-variant">{subtitle}</p> : null}
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
    </header>
  );
}
