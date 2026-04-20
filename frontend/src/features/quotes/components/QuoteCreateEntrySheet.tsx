import * as Dialog from "@radix-ui/react-dialog";

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
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center px-4 pb-4 sm:items-center sm:pb-0">
          <Dialog.Content className="modal-shadow pointer-events-auto w-full max-w-md rounded-[1.75rem] border border-outline-variant/20 bg-surface-container-lowest p-6">
            <Dialog.Title className="font-headline text-xl font-bold tracking-tight text-on-surface">
              {title}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-6 text-on-surface-variant">
              {description}
            </Dialog.Description>

            <div className="mt-6 space-y-3">
              <button
                type="button"
                className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-lg forest-gradient px-4 py-3 text-sm font-semibold text-on-primary transition-all active:scale-[0.98]"
                onClick={onCreateNew}
              >
                Create new
              </button>
              <button
                type="button"
                className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-lg border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-lowest"
                onClick={onCreateFromExisting}
              >
                Create from existing
              </button>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
