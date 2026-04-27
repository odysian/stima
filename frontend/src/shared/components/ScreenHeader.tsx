import type { ReactNode } from "react";
import { Button } from "@/shared/components/Button";
import { Eyebrow } from "@/ui/Eyebrow";
import { AppIcon } from "@/ui/Icon";

interface ScreenHeaderProps {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  onBack?: () => void;
  trailing?: ReactNode;
  backLabel?: string;
  layout?: "default" | "top-level";
}

export function ScreenHeader({
  title,
  eyebrow,
  subtitle,
  onBack,
  trailing,
  backLabel = "Back",
  layout = "default",
}: ScreenHeaderProps): React.ReactElement {
  const isTopLevelLayout = layout === "top-level";

  return (
    <header className="safe-top glass-surface glass-shadow-top fixed top-0 z-50 h-16 w-full border-b border-outline-variant/20 backdrop-blur-md">
      <div
        className={[
          "flex h-16 w-full items-center gap-3 px-4",
          isTopLevelLayout ? "mx-auto max-w-3xl" : "",
        ].join(" ")}
      >
        {onBack ? (
          <Button
            type="button"
            variant="iconButton"
            size="sm"
            onClick={onBack}
            aria-label={backLabel}
            className="text-primary"
          >
            <AppIcon name="arrow_back" className="block text-xl leading-none" />
          </Button>
        ) : null}
        {isTopLevelLayout ? (
          <p className="shrink-0 font-headline text-[2rem] font-bold leading-none text-primary">Stima</p>
        ) : null}
        <div className={["min-w-0 flex-1", isTopLevelLayout ? "text-right" : ""].join(" ")}>
          {eyebrow ? (
            <Eyebrow className="truncate">{eyebrow}</Eyebrow>
          ) : null}
          <h1 className="truncate font-headline text-lg font-bold tracking-tight text-on-surface">{title}</h1>
          {subtitle ? <p className="truncate text-xs text-on-surface-variant">{subtitle}</p> : null}
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
    </header>
  );
}
