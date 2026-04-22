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

const spinnerSizeClasses: Record<ButtonSize, string> = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
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
          <svg
            data-testid="button-spinner"
            className={`animate-spin ${spinnerSizeClasses[size]}`}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-90"
              fill="currentColor"
              d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4z"
            />
          </svg>
          <span className="sr-only">Loading</span>
        </span>
      ) : null}
    </button>
  );
}
