import { Button } from "@/shared/components/Button";
import { Sheet, SheetBody, SheetCloseButton, SheetDescription, SheetHeader, SheetTitle } from "@/ui/Sheet";

interface QuoteCreateEntrySheetProps {
  open: boolean;
  onClose: () => void;
  onCreateNew: () => void;
  onCreateFromExisting: () => void;
  title?: string;
  description?: string;
}

export function QuoteCreateEntrySheet({
  open,
  onClose,
  onCreateNew,
  onCreateFromExisting,
  title = "Create quote",
  description = "Start fresh or duplicate from an existing quote.",
}: QuoteCreateEntrySheetProps): React.ReactElement {
  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}
      size="md"
      contentProps={{ className: "bg-surface-container-lowest" }}
    >
      <SheetHeader>
        <div>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </div>
        <SheetCloseButton />
      </SheetHeader>

      <SheetBody>
        <div className="mt-2 space-y-3">
          <Button
            type="button"
            variant="primary"
            size="md"
            className="w-full"
            onClick={onCreateNew}
          >
            Create new
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="w-full"
            onClick={onCreateFromExisting}
          >
            Create from existing
          </Button>
        </div>
      </SheetBody>
    </Sheet>
  );
}
