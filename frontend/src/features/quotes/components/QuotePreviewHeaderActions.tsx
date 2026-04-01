import type { OverflowMenuItem } from "@/shared/components/OverflowMenu";
import { OverflowMenu } from "@/shared/components/OverflowMenu";
import { StatusBadge } from "@/shared/components/StatusBadge";

import type { QuoteStatus } from "@/features/quotes/types/quote.types";

interface QuotePreviewHeaderActionsProps {
  status: QuoteStatus;
  canEdit: boolean;
  onEdit: () => void;
  overflowItems: OverflowMenuItem[];
}

export function QuotePreviewHeaderActions({
  status,
  canEdit,
  onEdit,
  overflowItems,
}: QuotePreviewHeaderActionsProps): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <StatusBadge variant={status} />
      {canEdit ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit quote"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-outline-variant/30 bg-surface-container-lowest text-on-surface ghost-shadow transition-all hover:bg-surface-container-low active:scale-95"
        >
          <span className="material-symbols-outlined block text-[1.125rem] leading-none">edit</span>
        </button>
      ) : null}
      <OverflowMenu items={overflowItems} />
    </div>
  );
}
