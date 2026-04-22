import { useId, type ChangeEvent, type ReactNode } from "react";

interface SelectProps {
  label?: string;
  id?: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  className?: string;
  required?: boolean;
  hideLabel?: boolean;
  error?: string;
  hint?: string;
  invalid?: boolean;
  size?: "sm" | "md";
  children: ReactNode;
}

export function Select({
  label,
  id,
  value,
  onChange,
  className,
  required = false,
  hideLabel = false,
  error,
  hint,
  invalid = false,
  size = "md",
  children,
}: SelectProps): React.ReactElement {
  const generatedId = useId();
  const accessibilityBaseId = id ?? `select-${generatedId.replaceAll(":", "")}`;
  const hintId = hint ? `${accessibilityBaseId}-hint` : undefined;
  const errorId = error ? `${accessibilityBaseId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const hasError = invalid || Boolean(error);

  const fieldClassName = [
    "relative rounded-[var(--radius-document)] bg-surface-container-high px-4 font-body text-sm text-on-surface transition-all",
    "focus-within:bg-surface-container-lowest focus-within:ring-2 focus-within:ring-primary/30",
    size === "md" ? "min-h-[var(--tap-target-min)]" : "min-h-9",
    hasError ? "border border-error" : "border border-transparent",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <label
          htmlFor={id}
          className={[
            hideLabel ? "sr-only" : "text-sm font-medium",
            hasError ? "text-error" : "text-on-surface",
          ].join(" ")}
        >
          {label}
        </label>
      ) : null}

      <div className={fieldClassName}>
        <select
          id={id}
          value={value}
          onChange={onChange}
          required={required}
          aria-required={required}
          aria-invalid={hasError}
          aria-describedby={describedBy}
          className={[
            "h-full w-full appearance-none bg-transparent py-2 pr-6 text-sm text-on-surface outline-none",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {children}
        </select>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-on-surface-variant"
        >
          ▾
        </span>
      </div>

      {hint ? (
        <p id={hintId} className={hasError ? "text-xs text-error" : "text-xs text-on-surface-variant"}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
