import type { ChangeEvent } from "react";

interface InputProps {
  label?: string;
  id?: string;
  placeholder?: string;
  className?: string;
  type?: string;
  required?: boolean;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  error?: string;
}

export function Input({
  label,
  id,
  placeholder,
  className,
  type = "text",
  required = false,
  value,
  onChange,
  error,
}: InputProps): React.ReactElement {
  const inputClassName = [
    "w-full bg-surface-container-high rounded-lg px-4 py-3 font-body text-sm text-on-surface",
    "placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-surface-container-lowest transition-all",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <label htmlFor={id} className="text-sm font-medium text-on-surface">
          {label}
        </label>
      ) : null}
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        aria-required={required}
        placeholder={placeholder}
        className={inputClassName}
      />
      {error ? <p className="text-xs text-error">{error}</p> : null}
    </div>
  );
}
