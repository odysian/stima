import type { ReactNode } from "react";
import { useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/shared/components/Button";

interface ConfirmModalProps {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmDisabled?: boolean;
  variant?: "primary" | "destructive";
}

export function ConfirmModal({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  confirmDisabled = false,
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
    if (confirmDisabled) {
      return;
    }
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
        <div className="sheet-safe-bottom pointer-events-none fixed inset-0 z-50 flex items-end justify-center px-4 sm:items-center">
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
              <Dialog.Description className="mt-2 break-words text-sm leading-6 text-on-surface-variant">
                {body}
              </Dialog.Description>
            ) : null}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
              <Button
                type="button"
                variant={variant}
                size="md"
                className="flex-1"
                onClick={handleConfirm}
                disabled={confirmDisabled || undefined}
              >
                {confirmLabel}
              </Button>
              <Button
                type="button"
                ref={cancelButtonRef}
                variant="secondary"
                size="md"
                className="flex-1"
                onClick={handleCancel}
              >
                {cancelLabel}
              </Button>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
