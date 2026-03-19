import type { ChangeEvent } from "react";

interface InputProps {
  label: string;
  id: string;
  type?: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  error?: string;
}

export function Input({
  label,
  id,
  type = "text",
  value,
  onChange,
  error,
}: InputProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
