import type { OverflowMenuItem } from "@/shared/components/OverflowMenu";
import { Button } from "@/shared/components/Button";
import { OverflowMenu } from "@/shared/components/OverflowMenu";
import { AppIcon } from "@/ui/Icon";

interface QuotePreviewHeaderActionsProps {
  canEdit: boolean;
  onEdit: () => void;
  overflowItems: OverflowMenuItem[];
}

export function QuotePreviewHeaderActions({
  canEdit,
  onEdit,
  overflowItems,
}: QuotePreviewHeaderActionsProps): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      {canEdit ? (
        <Button
          type="button"
          variant="iconButton"
          size="sm"
          onClick={onEdit}
          aria-label="Edit quote"
          className="border border-outline-variant/30 bg-surface-container-lowest text-on-surface ghost-shadow"
        >
          <AppIcon name="edit" className="block text-[1.125rem] leading-none" />
        </Button>
      ) : null}
      <OverflowMenu items={overflowItems} />
    </div>
  );
}
