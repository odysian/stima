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
  description: string;
}> = [
  {
    value: "quote",
    label: "Quote",
    description: "Continue to preview before sharing.",
  },
  {
    value: "invoice",
    label: "Invoice",
    description: "Create an invoice with a due date.",
  },
];

export function ReviewDocumentTypeSelector({
  value,
  disabled,
  isInvoiceDisabled,
  onChange,
}: ReviewDocumentTypeSelectorProps): React.ReactElement {
  const helpText = disabled
    ? "Shared documents can't change type."
    : (isInvoiceDisabled
      ? "Select a customer before making this an invoice."
      : null);

  return (
    <section className="space-y-3">
      <div>
        <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
          Document Type
        </p>
        <p className="mt-1 text-sm text-on-surface-variant">
          Switch between quote and invoice without leaving the editor.
        </p>
      </div>

      <div role="radiogroup" aria-label="Document type" className="grid gap-3 sm:grid-cols-2">
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

      {helpText ? (
        <p className="text-sm text-outline">
          {helpText}
        </p>
      ) : null}
    </section>
  );
}
