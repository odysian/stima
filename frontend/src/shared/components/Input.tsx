import { forwardRef, useId, type ChangeEvent, type FocusEvent, type ReactNode } from "react";

export interface InputProps {
  label?: string;
  id?: string;
  placeholder?: string;
  className?: string;
  fieldClassName?: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  hideLabel?: boolean;
  maxLength?: number;
  value: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  hint?: string;
  startAdornment?: ReactNode;
  endAdornment?: ReactNode;
  invalid?: boolean;
  size?: "sm" | "md";
  inputMode?: "text" | "decimal" | "numeric" | "email" | "tel";
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({
  label,
  id,
  placeholder,
  className,
  fieldClassName,
  type = "text",
  autoComplete,
  required = false,
  disabled = false,
  readOnly = false,
  hideLabel = false,
  maxLength,
  value,
  onChange,
  error,
  hint,
  startAdornment,
  endAdornment,
  invalid = false,
  size = "md",
  inputMode,
  onBlur,
  onFocus,
}: InputProps, ref) {
  const generatedId = useId();
  const accessibilityBaseId = id ?? `input-${generatedId.replaceAll(":", "")}`;
  const hintId = hint ? `${accessibilityBaseId}-hint` : undefined;
  const errorId = error ? `${accessibilityBaseId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const hasError = invalid || Boolean(error);

  const fieldWrapperClassName = [
    "flex items-center gap-2 rounded-[var(--radius-document)] bg-surface-container-high px-4 font-body text-sm text-on-surface transition-all",
    "focus-within:bg-surface-container-lowest focus-within:ring-2 focus-within:ring-focus-ring",
    size === "md" ? "min-h-[var(--tap-target-min)] py-2" : "min-h-9 py-1.5",
    hasError ? "border border-error" : "border border-transparent",
    disabled ? "cursor-not-allowed opacity-70" : "",
    fieldClassName,
  ]
    .filter(Boolean)
    .join(" ");

  const inputClassName = [
    "w-full bg-transparent text-sm text-on-surface placeholder:text-outline focus:outline-none",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <label
          htmlFor={accessibilityBaseId}
          className={[
            hideLabel ? "sr-only" : "text-sm font-medium",
            hasError ? "text-error" : "text-on-surface",
          ].join(" ")}
        >
          {label}
        </label>
      ) : null}
      <div className={fieldWrapperClassName}>
        {startAdornment ? (
          <span className="flex shrink-0 items-center text-sm text-on-surface-variant">
            {startAdornment}
          </span>
        ) : null}
        <input
          ref={ref}
          id={accessibilityBaseId}
          type={type}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
          readOnly={readOnly}
          aria-required={required}
          aria-invalid={hasError}
          aria-describedby={describedBy}
          maxLength={maxLength}
          placeholder={placeholder}
          inputMode={inputMode}
          onBlur={onBlur}
          onFocus={onFocus}
          className={inputClassName}
        />
        {endAdornment ? (
          <span className="flex shrink-0 items-center text-sm text-on-surface-variant">
            {endAdornment}
          </span>
        ) : null}
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
});
