import type { ElementType, HTMLAttributes, ReactNode } from "react";

interface EyebrowProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  as?: ElementType;
  children: ReactNode;
}

function mergeEyebrowClasses(className?: string): string {
  const extra = className?.trim() ? className.trim().split(/\s+/) : [];
  const sizeClassPattern = /^text-(?:xs|sm|base|lg|[0-9]+xl|\[)/;
  const hasSizeOverride = extra.some((token) => sizeClassPattern.test(token));
  const hasColorOverride = extra.some((token) => token.startsWith("text-") && !sizeClassPattern.test(token));
  const hasTrackingOverride = extra.some((token) => token.startsWith("tracking-"));
  const hasFontOverride = extra.some((token) => token.startsWith("font-"));

  const base = [
    hasSizeOverride ? null : "text-[0.6875rem]",
    hasFontOverride ? null : "font-bold",
    "uppercase",
    hasTrackingOverride ? null : "tracking-[0.12em]",
    hasColorOverride ? null : "text-outline",
  ].filter(Boolean);

  return [...base, ...extra].join(" ");
}

export function Eyebrow({ as: Component = "p", children, className, ...rest }: EyebrowProps): React.ReactElement {
  return (
    <Component className={mergeEyebrowClasses(className)} {...rest}>
      {children}
    </Component>
  );
}
