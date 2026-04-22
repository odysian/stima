import type { LineItemDraftWithFlags } from "@/features/quotes/types/quote.types";
import { Button } from "@/shared/components/Button";
import { Input } from "@/shared/components/Input";
import { resolveLineItemFlagMessage } from "@/features/quotes/utils/lineItemFlags";
import { NumericField } from "@/ui/NumericField";

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

  return (
    <div className="rounded-md border border-outline-variant p-4">
      {item.flagged ? (
        <p className="mb-3 rounded-md border border-warning-accent/40 bg-warning-container px-3 py-2 text-sm text-warning">
          {resolveLineItemFlagMessage(item.flagReason)}
        </p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-[1.3fr_1.3fr_0.8fr_auto] md:items-end">
        <div>
          <Input
            id={descriptionInputId}
            label="Description"
            value={item.description}
            onChange={(event) => onChange({ ...item, description: event.target.value })}
            error={descriptionError ?? undefined}
          />
        </div>

        <div>
          <Input
            id={detailsInputId}
            label="Details"
            value={item.details ?? ""}
            onChange={(event) =>
              onChange({
                ...item,
                details: event.target.value.trim().length > 0 ? event.target.value : null,
              })
            }
          />
        </div>

        <div>
          <NumericField
            id={priceInputId}
            label="Price"
            step={0.01}
            value={item.price === null ? "" : item.price.toString()}
            currencySymbol="$"
            onChange={(rawPriceValue) => {
              const normalizedValue = rawPriceValue.replaceAll(",", "").trim();
              if (normalizedValue === "") {
                onChange({ ...item, price: null });
                return;
              }
              const parsedValue = Number(normalizedValue);
              onChange({
                ...item,
                price: Number.isFinite(parsedValue) ? parsedValue : null,
              });
            }}
            showStepControls
            formatOnBlur
            hint="USD"
          />
        </div>

        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={onDelete}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
