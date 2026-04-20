import type { LineItemCatalogItem } from "@/features/line-item-catalog/types/lineItemCatalog.types";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";

interface LineItemCatalogTabPanelProps {
  loadState: "idle" | "loading" | "loaded" | "error";
  loadError: string | null;
  items: LineItemCatalogItem[];
  onRetry: () => void;
  onInsertItem: (item: LineItemCatalogItem) => void;
}

function formatCatalogPrice(value: number | null): string {
  if (value === null) {
    return "No default price";
  }
  return `$${value.toFixed(2)}`;
}

export function LineItemCatalogTabPanel({
  loadState,
  loadError,
  items,
  onRetry,
  onInsertItem,
}: LineItemCatalogTabPanelProps): React.ReactElement {
  return (
    <div id="line-item-tabpanel-catalog" role="tabpanel" className="space-y-2">
      {loadState === "loading" ? (
        <p role="status" className="text-sm text-on-surface-variant">Loading catalog items...</p>
      ) : null}

      {loadState === "error" && loadError ? (
        <div className="space-y-2">
          <FeedbackMessage variant="error">{loadError}</FeedbackMessage>
          <button
            type="button"
            className="inline-flex min-h-9 items-center rounded-lg border border-outline-variant/40 px-3 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container-low"
            onClick={onRetry}
          >
            Retry
          </button>
        </div>
      ) : null}

      {loadState === "loaded" && items.length === 0 ? (
        <p className="rounded-lg bg-surface-container-high p-4 text-sm text-on-surface-variant">
          No catalog items yet. Save one from the Manual tab or from another line item.
        </p>
      ) : null}

      {loadState === "loaded" && items.length > 0 ? (
        <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-outline-variant/20 bg-surface-container-high p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-on-surface">{item.title}</p>
                  <p className="text-xs text-on-surface-variant">{formatCatalogPrice(item.defaultPrice)}</p>
                  {item.details ? (
                    <p className="mt-1 text-sm text-on-surface-variant">{item.details}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="inline-flex min-h-9 shrink-0 items-center rounded-lg border border-primary/40 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
                  onClick={() => onInsertItem(item)}
                >
                  Insert
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
