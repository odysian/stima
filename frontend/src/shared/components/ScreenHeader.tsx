import type { ReactNode } from "react";

interface ScreenHeaderProps {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  onBack?: () => void;
  trailing?: ReactNode;
  backLabel?: string;
}

export function ScreenHeader({
  title,
  eyebrow,
  subtitle,
  onBack,
  trailing,
  backLabel = "Back",
}: ScreenHeaderProps): React.ReactElement {
  return (
    <header className="glass-surface glass-shadow-top fixed top-0 z-50 h-16 w-full border-b border-outline-variant/20 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            className="cursor-pointer rounded-full p-2 text-primary transition-all hover:bg-surface-container-low active:scale-95"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <p className="truncate text-[0.6875rem] font-bold uppercase tracking-wider text-outline">{eyebrow}</p>
          ) : null}
          <h1 className="truncate font-headline text-lg font-bold tracking-tight text-on-surface">{title}</h1>
          {subtitle ? <p className="truncate text-xs text-on-surface-variant">{subtitle}</p> : null}
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
    </header>
  );
}
