import type { LineItemDraft } from "@/features/quotes/types/quote.types";

interface LineItemRowProps {
  item: LineItemDraft;
  onChange: (updated: LineItemDraft) => void;
  onDelete: () => void;
}

export function LineItemRow({ item, onChange, onDelete }: LineItemRowProps): React.ReactElement {
  return (
    <div className="rounded-md border border-slate-200 p-4">
      <div className="grid gap-3 md:grid-cols-[1.3fr_1.3fr_0.8fr_auto] md:items-end">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700" htmlFor={`description-${item.description}`}>
            Description
          </label>
          <input
            id={`description-${item.description}`}
            type="text"
            value={item.description}
            onChange={(event) => onChange({ ...item, description: event.target.value })}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700" htmlFor={`details-${item.description}`}>
            Details
          </label>
          <input
            id={`details-${item.description}`}
            type="text"
            value={item.details ?? ""}
            onChange={(event) =>
              onChange({
                ...item,
                details: event.target.value.trim().length > 0 ? event.target.value : null,
              })
            }
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700" htmlFor={`price-${item.description}`}>
            Price
          </label>
          <input
            id={`price-${item.description}`}
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
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
        </div>

        <button
          type="button"
          onClick={onDelete}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
