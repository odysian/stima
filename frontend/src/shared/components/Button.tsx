import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "tonal" | "destructive" | "ghost" | "iconButton";
type ButtonSize = "sm" | "md" | "lg";

interface BaseButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  className?: string;
  size?: ButtonSize;
  isLoading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

type RegularButtonProps = BaseButtonProps & {
  variant?: Exclude<ButtonVariant, "iconButton">;
  children: ReactNode;
};

type IconButtonProps = BaseButtonProps & {
  variant: "iconButton";
  children?: ReactNode;
  "aria-label": string;
};

type ButtonProps = RegularButtonProps | IconButtonProps;

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "forest-gradient rounded-[var(--radius-document)] text-on-primary hover:brightness-105",
  secondary:
    "rounded-[var(--radius-document)] bg-surface-container-high text-on-surface hover:bg-surface-container",
  tonal:
    "rounded-[var(--radius-document)] bg-primary/15 text-primary hover:bg-primary/20",
  destructive:
    "rounded-[var(--radius-document)] border border-secondary text-secondary hover:bg-secondary/10",
  ghost:
    "rounded-[var(--radius-document)] bg-transparent text-on-surface-variant hover:bg-surface-container-low",
  iconButton:
    "rounded-full bg-transparent text-on-surface-variant hover:bg-surface-container-low",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-11 px-3 py-2 text-sm",
  md: "min-h-12 px-4 py-4 text-sm",
  lg: "min-h-14 px-5 py-5 text-base",
};

const iconButtonSizeClasses: Record<ButtonSize, string> = {
  sm: "h-11 w-11 min-h-11 min-w-11 p-0",
  md: "h-12 w-12 min-h-12 min-w-12 p-0",
  lg: "h-14 w-14 min-h-14 min-w-14 p-0",
};

const spinnerContainerSizeClasses: Record<ButtonSize, string> = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
};

const spinnerDotClasses: Record<ButtonSize, { top: string; bottom: string }> = {
  sm: {
    top: "top-0 h-1.5 w-1.5",
    bottom: "bottom-0 h-1 w-1",
  },
  md: {
    top: "top-0 h-2 w-2",
    bottom: "bottom-0 h-1.5 w-1.5",
  },
  lg: {
    top: "top-0 h-2.5 w-2.5",
    bottom: "bottom-0 h-2 w-2",
  },
};

const spinnerToneClasses: Record<ButtonVariant, string> = {
  primary: "text-on-primary",
  secondary: "text-on-surface",
  tonal: "text-primary",
  destructive: "text-secondary",
  ghost: "text-on-surface-variant",
  iconButton: "text-on-surface-variant",
};

const contentGapClasses: Record<ButtonSize, string> = {
  sm: "gap-1.5",
  md: "gap-2",
  lg: "gap-2.5",
};

export function Button({
  children,
  variant = "primary",
  className,
  size = "md",
  type = "button",
  disabled = false,
  isLoading = false,
  leadingIcon,
  trailingIcon,
  ...rest
}: ButtonProps): React.ReactElement {
  if (variant === "iconButton" && !rest["aria-label"]) {
    throw new Error("Button variant `iconButton` requires an aria-label.");
  }

  const isIconButton = variant === "iconButton";

  const buttonClassName = [
    "relative inline-flex items-center justify-center font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
    variantClasses[variant],
    isIconButton ? iconButtonSizeClasses[size] : `${sizeClasses[size]} min-w-[6ch]`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={buttonClassName}
    >
      <span
        className={`inline-flex items-center justify-center whitespace-nowrap ${isIconButton ? "leading-none" : contentGapClasses[size]} ${isLoading ? "opacity-0" : "opacity-100"}`}
      >
        {isIconButton ? (
          children
        ) : (
          <>
            {leadingIcon ? (
              <span aria-hidden="true" className="inline-flex items-center justify-center leading-none">
                {leadingIcon}
              </span>
            ) : null}
            <span className="leading-none">{children}</span>
            {trailingIcon ? (
              <span aria-hidden="true" className="inline-flex items-center justify-center leading-none">
                {trailingIcon}
              </span>
            ) : null}
          </>
        )}
      </span>
      {isLoading ? (
        <span className="pointer-events-none absolute inset-0 inline-flex items-center justify-center">
          <span
            aria-hidden="true"
            className={`relative inline-flex items-center justify-center ${spinnerContainerSizeClasses[size]} ${spinnerToneClasses[variant]}`}
          >
            <span data-testid="button-spinner" className="absolute inset-0 animate-spin [animation-duration:1.1s]">
              <span
                className={`absolute left-1/2 -translate-x-1/2 rounded-full bg-current ${spinnerDotClasses[size].top}`}
              />
              <span
                className={`absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full bg-current opacity-[0.65] ${spinnerDotClasses[size].bottom}`}
              />
            </span>
          </span>
          <span className="sr-only">Loading</span>
        </span>
      ) : null}
    </button>
  );
}
