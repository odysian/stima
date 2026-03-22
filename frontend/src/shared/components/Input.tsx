import type { ChangeEvent } from "react";

interface InputProps {
  label?: string;
  id?: string;
  placeholder?: string;
  className?: string;
  type?: string;
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
  value,
  onChange,
  error,
}: InputProps): React.ReactElement {
  const inputClassName = [
    "w-full bg-surface-container-high rounded-lg px-4 py-3 font-body text-sm text-on-surface",
    "placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-white transition-all",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
        </label>
      ) : null}
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={inputClassName}
      />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
