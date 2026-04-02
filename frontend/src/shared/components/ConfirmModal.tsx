import { useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";

interface ConfirmModalProps {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "primary" | "destructive";
}

const confirmButtonClasses = {
  primary: "forest-gradient text-on-primary",
  destructive: "bg-secondary text-on-secondary",
} as const;

export function ConfirmModal({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  variant = "primary",
}: ConfirmModalProps): React.ReactElement {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusTargetRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  function restoreFocus(): void {
    if (restoreFocusTargetRef.current?.isConnected) {
      restoreFocusTargetRef.current.focus();
    }
  }

  function handleCancel(): void {
    onCancel();
    queueMicrotask(restoreFocus);
  }

  function handleConfirm(): void {
    onConfirm();
    queueMicrotask(restoreFocus);
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) handleCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          data-testid="confirm-modal-overlay"
          className="modal-backdrop fixed inset-0 z-50"
        />
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center px-4 pb-4 sm:items-center sm:pb-0">
          <Dialog.Content
            {...(!body ? { "aria-describedby": undefined } : {})}
            className="modal-shadow pointer-events-auto w-full max-w-md rounded-[1.75rem] border border-outline-variant/20 bg-surface-container-lowest p-6"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              cancelButtonRef.current?.focus();
            }}
          >
            <Dialog.Title className="font-headline text-xl font-bold tracking-tight text-on-surface">{title}</Dialog.Title>
            {body ? (
              <Dialog.Description className="mt-2 text-sm leading-6 text-on-surface-variant">
                {body}
              </Dialog.Description>
            ) : null}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
              <button
                type="button"
                className={`inline-flex min-h-12 cursor-pointer flex-1 items-center justify-center rounded-lg px-4 py-3 text-sm font-semibold transition-all active:scale-[0.98] ${confirmButtonClasses[variant]}`}
                onClick={handleConfirm}
              >
                {confirmLabel}
              </button>
              <button
                type="button"
                ref={cancelButtonRef}
                className="inline-flex min-h-12 cursor-pointer flex-1 items-center justify-center rounded-lg border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-lowest"
                onClick={handleCancel}
              >
                {cancelLabel}
              </button>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
