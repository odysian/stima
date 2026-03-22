interface TradeTypeSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

const TRADE_OPTIONS = ["Plumber", "Electrician", "Builder", "Painter", "Landscaper", "Other"] as const;

export function TradeTypeSelector({ value, onChange }: TradeTypeSelectorProps): React.ReactElement {
  return (
    <div className="grid grid-cols-2 gap-2">
      {TRADE_OPTIONS.map((option) => {
        const isSelected = option === value;

        return (
          <button
            key={option}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(option)}
            className={[
              "py-3 rounded-lg font-label text-sm",
              isSelected
                ? "border-2 border-primary bg-primary/5 text-primary font-semibold"
                : "border border-outline-variant/30 bg-surface-container-lowest text-on-surface-variant",
            ].join(" ")}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
