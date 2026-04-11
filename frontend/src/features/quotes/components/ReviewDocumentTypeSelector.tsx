export type ReviewDocumentType = "quote" | "invoice";

interface ReviewDocumentTypeSelectorProps {
  value: ReviewDocumentType;
  disabled: boolean;
  isInvoiceDisabled: boolean;
  onChange: (value: ReviewDocumentType) => void;
}

const OPTIONS: Array<{
  value: ReviewDocumentType;
  label: string;
}> = [
  {
    value: "quote",
    label: "Quote",
  },
  {
    value: "invoice",
    label: "Invoice",
  },
];

export function ReviewDocumentTypeSelector({
  value,
  disabled,
  isInvoiceDisabled,
  onChange,
}: ReviewDocumentTypeSelectorProps): React.ReactElement {
  return (
    <section className="space-y-2">
      <div>
        <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
          Document Type
        </p>
      </div>

      <div role="radiogroup" aria-label="Document type" className="flex flex-row gap-3">
        {OPTIONS.map((option) => {
          const isSelected = option.value === value;
          const isOptionDisabled = disabled || (option.value === "invoice" && isInvoiceDisabled);

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={isOptionDisabled}
              className={[
                "w-full cursor-pointer rounded-xl py-3 text-center font-headline text-lg font-bold tracking-tight transition-all",
                "disabled:cursor-not-allowed disabled:opacity-60",
                isSelected
                  ? "ghost-shadow bg-surface-container-lowest ring-2 ring-primary/30 text-on-surface"
                  : "bg-surface-container-low text-on-surface hover:bg-surface-container-lowest",
              ].join(" ")}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {disabled ? (
        <p className="text-xs text-warning">
          Shared documents can't change type.
        </p>
      ) : isInvoiceDisabled ? (
        <p className="text-xs text-warning">
          Assign a customer to enable invoice.
        </p>
      ) : null}
    </section>
  );
}
