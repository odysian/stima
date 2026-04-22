import type { ElementType, HTMLAttributes, ReactNode } from "react";

interface EyebrowProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  as?: ElementType;
  children: ReactNode;
}

function mergeEyebrowClasses(className?: string): string {
  const extra = className?.trim() ? className.trim().split(/\s+/) : [];
  const hasTextOverride = extra.some((token) => token.startsWith("text-"));
  const hasTrackingOverride = extra.some((token) => token.startsWith("tracking-"));
  const hasFontOverride = extra.some((token) => token.startsWith("font-"));

  const base = [
    hasTextOverride ? null : "text-[0.6875rem]",
    hasFontOverride ? null : "font-bold",
    "uppercase",
    hasTrackingOverride ? null : "tracking-[0.12em]",
    hasTextOverride ? null : "text-outline",
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
