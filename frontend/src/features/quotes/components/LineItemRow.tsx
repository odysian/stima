import type { LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";

interface LineItemRowProps {
  rowId: string;
  item: LineItemDraftWithFlags;
  onChange: (updated: LineItemDraftWithFlags) => void;
  onDelete: () => void;
  descriptionError?: string | null;
}

export function LineItemRow({
  rowId,
  item,
  onChange,
  onDelete,
  descriptionError = null,
}: LineItemRowProps): React.ReactElement {
  const descriptionInputId = `${rowId}-description`;
  const detailsInputId = `${rowId}-details`;
  const priceInputId = `${rowId}-price`;
  const inputClassName =
    "rounded-md border border-outline-variant px-3 py-2 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

  return (
    <div className="rounded-md border border-outline-variant p-4">
      {item.flagged ? (
        <p className="mb-3 rounded-md border border-warning-accent/40 bg-warning-container px-3 py-2 text-sm text-warning">
          {item.flagReason ?? "This item may need review"}
        </p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-[1.3fr_1.3fr_0.8fr_auto] md:items-end">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-on-surface" htmlFor={descriptionInputId}>
            Description
          </label>
          <input
            id={descriptionInputId}
            type="text"
            value={item.description}
            onChange={(event) => onChange({ ...item, description: event.target.value })}
            className={inputClassName}
          />
          {descriptionError ? <p className="text-xs text-error">{descriptionError}</p> : null}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-on-surface" htmlFor={detailsInputId}>
            Details
          </label>
          <input
            id={detailsInputId}
            type="text"
            value={item.details ?? ""}
            onChange={(event) =>
              onChange({
                ...item,
                details: event.target.value.trim().length > 0 ? event.target.value : null,
              })
            }
            className={inputClassName}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-on-surface" htmlFor={priceInputId}>
            Price
          </label>
          <input
            id={priceInputId}
            type="number"
            step="0.01"
            value={item.price ?? ""}
            onChange={(event) => {
              const rawValue = event.target.value.trim();
              if (rawValue === "") {
                onChange({ ...item, price: null });
                return;
              }
              const parsedValue = Number(rawValue);
              onChange({
                ...item,
                price: Number.isFinite(parsedValue) ? parsedValue : null,
              });
            }}
            className={inputClassName}
          />
        </div>

        <button
          type="button"
          onClick={onDelete}
          className="rounded-md border border-outline-variant px-3 py-2 text-sm font-medium text-on-surface transition hover:bg-surface-container-low"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
