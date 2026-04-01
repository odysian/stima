import type { ReactNode } from "react";

interface ButtonProps {
  children: ReactNode;
  variant?: "primary" | "destructive" | "ghost";
  className?: string;
  type?: "button" | "submit";
  form?: string;
  disabled?: boolean;
  isLoading?: boolean;
  onClick?: () => void;
}

const variantClasses = {
  primary:
    "forest-gradient text-on-primary font-semibold py-4 rounded-lg active:scale-[0.98] transition-all",
  destructive:
    "border border-secondary text-secondary font-semibold py-4 rounded-lg active:scale-[0.98] transition-all",
  ghost: "p-2 rounded-full hover:bg-surface-container-low active:scale-95 transition-all",
} as const;

export function Button({
  children,
  variant = "primary",
  className,
  type = "button",
  form,
  disabled = false,
  isLoading = false,
  onClick,
}: ButtonProps): React.ReactElement {
  const buttonClassName = [
    "inline-flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-60",
    variantClasses[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      form={form}
      onClick={onClick}
      disabled={disabled || isLoading}
      className={buttonClassName}
    >
      {isLoading ? "Loading..." : children}
    </button>
  );
}
