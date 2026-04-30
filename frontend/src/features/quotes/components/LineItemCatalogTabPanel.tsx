import type { LineItemCatalogItem } from "@/features/line-item-catalog/types/lineItemCatalog.types";
import { Button } from "@/shared/components/Button";
import { FeedbackMessage } from "@/shared/components/FeedbackMessage";
import { Card } from "@/ui/Card";
import { Eyebrow } from "@/ui/Eyebrow";

interface LineItemCatalogTabPanelProps {
  loadState: "idle" | "loading" | "loaded" | "error";
  loadError: string | null;
  items: LineItemCatalogItem[];
  onRetry: () => void;
  onInsertItem: (item: LineItemCatalogItem) => void;
  panelClassName?: string;
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
  panelClassName,
}: LineItemCatalogTabPanelProps): React.ReactElement {
  const className = ["space-y-3", panelClassName].filter(Boolean).join(" ");
  return (
    <div id="line-item-tabpanel-catalog" role="tabpanel" className={className}>
      {loadState === "loading" ? (
        <p role="status" className="text-sm text-on-surface-variant">Loading catalog items...</p>
      ) : null}

      {loadState === "error" && loadError ? (
        <div className="space-y-2">
          <FeedbackMessage variant="error">{loadError}</FeedbackMessage>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-9 px-3 text-xs"
            onClick={onRetry}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {loadState === "loaded" && items.length === 0 ? (
        <Card className="bg-surface-container-high">
          <p className="text-sm text-on-surface-variant">
            No catalog items yet. Save one from the Manual tab or from another line item.
          </p>
        </Card>
      ) : null}

      {loadState === "loaded" && items.length > 0 ? (
        <ul className="space-y-2 overflow-y-auto pr-1">
          {items.map((item) => (
            <li key={item.id}>
              <Card className="border border-outline-variant/20 bg-surface-container-high p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-on-surface">{item.title}</p>
                    <Eyebrow>{formatCatalogPrice(item.defaultPrice)}</Eyebrow>
                    {item.details ? (
                      <p className="mt-1 text-sm text-on-surface-variant">{item.details}</p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="shrink-0 px-3 text-xs text-primary"
                    onClick={() => onInsertItem(item)}
                  >
                    Insert
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
