import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/shared/components/Button";

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
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop fixed inset-0 z-50" />
        <div className="sheet-safe-bottom pointer-events-none fixed inset-0 z-50 flex items-end justify-center px-4 sm:items-center">
          <Dialog.Content className="modal-shadow pointer-events-auto w-full max-w-md rounded-[1.75rem] border border-outline-variant/20 bg-surface-container-lowest p-6">
            <Dialog.Title className="font-headline text-xl font-bold tracking-tight text-on-surface">
              {title}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-6 text-on-surface-variant">
              {description}
            </Dialog.Description>

            <div className="mt-6 space-y-3">
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
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
