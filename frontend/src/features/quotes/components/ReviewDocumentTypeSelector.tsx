export type ReviewDocumentType = "quote" | "invoice";

interface ReviewDocumentTypeSelectorProps {
  value: ReviewDocumentType;
  disabled: boolean;
  onChange: (value: ReviewDocumentType) => void;
}

const OPTIONS: Array<{
  value: ReviewDocumentType;
  label: string;
  description: string;
}> = [
  {
    value: "quote",
    label: "Quote",
    description: "Generate a quote preview first.",
  },
  {
    value: "invoice",
    label: "Invoice",
    description: "Create the invoice directly with a default due date.",
  },
];

export function ReviewDocumentTypeSelector({
  value,
  disabled,
  onChange,
}: ReviewDocumentTypeSelectorProps): React.ReactElement {
  return (
    <section className="space-y-3">
      <div>
        <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
          Final Handoff
        </p>
        <p className="mt-1 text-sm text-on-surface-variant">
          Choose what to create from this builder draft.
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Document type"
        className="grid gap-3 sm:grid-cols-2"
      >
        {OPTIONS.map((option) => {
          const isSelected = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              className={[
                "rounded-xl p-4 text-left transition-all",
                "disabled:cursor-not-allowed disabled:opacity-60",
                isSelected
                  ? "ghost-shadow bg-surface-container-lowest ring-2 ring-primary/30"
                  : "bg-surface-container-low hover:bg-surface-container-lowest",
              ].join(" ")}
              onClick={() => onChange(option.value)}
            >
              <p className="font-headline text-lg font-bold tracking-tight text-on-surface">
                {option.label}
              </p>
              <p className="mt-2 text-sm text-on-surface-variant">{option.description}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
