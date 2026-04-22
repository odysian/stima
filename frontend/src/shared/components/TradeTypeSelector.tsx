interface TradeTypeSelectorProps {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
}

export function TradeTypeSelector({
  options,
  value,
  onChange,
}: TradeTypeSelectorProps): React.ReactElement {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((option) => {
        const isSelected = option === value;

        return (
          <button
            key={option}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(option)}
            className={[
              "cursor-pointer py-3 rounded-[var(--radius-document)] font-label text-sm",
              isSelected
                ? "ghost-shadow border border-primary/30 bg-surface-container-lowest text-on-surface font-semibold"
                : "border border-outline-variant/30 bg-surface-container-low text-on-surface-variant",
            ].join(" ")}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
