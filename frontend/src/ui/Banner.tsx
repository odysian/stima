import { Button } from "@/shared/components/Button";
import { Eyebrow } from "@/ui/Eyebrow";

type BannerKind = "warn" | "info" | "success" | "error";

interface BannerProps {
  title: string;
  message: string;
  kind?: BannerKind;
  onDismiss?: () => void;
  dismissLabel?: string;
}

const kindStyles: Record<BannerKind, {
  container: string;
  title: string;
  body: string;
  icon: string;
}> = {
  warn: {
    container: "border-l-4 border-warning-accent bg-warning-container",
    title: "text-warning",
    body: "text-warning",
    icon: "error",
  },
  info: {
    container: "border-l-4 border-info bg-info-container",
    title: "text-info",
    body: "text-info",
    icon: "info",
  },
  success: {
    container: "border-l-4 border-success bg-success-container",
    title: "text-success",
    body: "text-success",
    icon: "check_circle",
  },
  error: {
    container: "border-l-4 border-error bg-error-container",
    title: "text-error",
    body: "text-error",
    icon: "error",
  },
};

export function Banner({
  title,
  message,
  kind = "warn",
  onDismiss,
  dismissLabel = "Dismiss message",
}: BannerProps): React.ReactElement {
  const style = kindStyles[kind];

  return (
    <section
      className={[
        "ghost-shadow rounded-[var(--radius-document)] p-4 backdrop-blur-md",
        style.container,
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <span className={["material-symbols-outlined", style.body].join(" ")}>{style.icon}</span>
        <div className="min-w-0 flex-1">
          <Eyebrow className={style.title}>{title}</Eyebrow>
          <p className={["text-sm font-medium leading-snug", style.body].join(" ")}>{message}</p>
        </div>
        {onDismiss ? (
          <Button
            type="button"
            variant="iconButton"
            size="xs"
            aria-label={dismissLabel}
            className={["shrink-0 hover:bg-current/10", style.body].join(" ")}
            onClick={onDismiss}
          >
            <span className="material-symbols-outlined text-base">close</span>
          </Button>
        ) : null}
      </div>
    </section>
  );
}
