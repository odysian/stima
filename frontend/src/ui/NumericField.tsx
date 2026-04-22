import { Input, type InputProps } from "@/shared/components/Input";

interface NumericFieldProps extends Omit<InputProps, "type" | "value" | "onChange" | "inputMode" | "startAdornment" | "endAdornment"> {
  value: string;
  onChange: (nextValue: string) => void;
  step?: number;
  min?: number;
  max?: number;
  locale?: string;
  formatOnBlur?: boolean;
  showStepControls?: boolean;
  currencySymbol?: string;
}

function parseNumericValue(value: string): number | null {
  const normalizedValue = value.replaceAll(",", "").trim();
  if (normalizedValue.length === 0) {
    return null;
  }

  const parsedValue = Number(normalizedValue);
  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  return parsedValue;
}

function roundToStepPrecision(value: number, step: number): number {
  const stepParts = step.toString().split(".");
  const precision = stepParts[1]?.length ?? 0;
  return Number(value.toFixed(precision));
}

function formatWithLocale(value: number, locale: string, step: number): string {
  const stepParts = step.toString().split(".");
  const precision = stepParts[1]?.length ?? 0;

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(value);
}

export function NumericField({
  value,
  onChange,
  step = 0.01,
  min,
  max,
  locale = "en-US",
  formatOnBlur = true,
  showStepControls = true,
  currencySymbol,
  ...props
}: NumericFieldProps): React.ReactElement {
  const applyStep = (direction: "up" | "down") => {
    const currentValue = parseNumericValue(value) ?? 0;
    const delta = direction === "up" ? step : -step;
    let nextValue = roundToStepPrecision(currentValue + delta, step);

    if (typeof min === "number") {
      nextValue = Math.max(min, nextValue);
    }
    if (typeof max === "number") {
      nextValue = Math.min(max, nextValue);
    }

    onChange(nextValue.toString());
  };

  return (
    <Input
      {...props}
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={(event) => {
        if (!formatOnBlur) {
          props.onBlur?.(event);
          return;
        }

        const parsedValue = parseNumericValue(value);
        if (parsedValue === null) {
          onChange("");
          props.onBlur?.(event);
          return;
        }

        onChange(formatWithLocale(parsedValue, locale, step));
        props.onBlur?.(event);
      }}
      onFocus={(event) => {
        if (formatOnBlur) {
          const parsedValue = parseNumericValue(value);
          if (parsedValue !== null) {
            onChange(roundToStepPrecision(parsedValue, step).toString());
          }
        }
        props.onFocus?.(event);
      }}
      inputMode="decimal"
      startAdornment={currencySymbol ? <span aria-hidden="true">{currencySymbol}</span> : undefined}
      endAdornment={showStepControls ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Decrease value"
            className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-document)] border border-outline-variant/40 text-xs text-on-surface-variant"
            onClick={() => applyStep("down")}
          >
            -
          </button>
          <button
            type="button"
            aria-label="Increase value"
            className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-document)] border border-outline-variant/40 text-xs text-on-surface-variant"
            onClick={() => applyStep("up")}
          >
            +
          </button>
        </div>
      ) : undefined}
    />
  );
}
