import type { ReactNode } from "react";
import { useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/shared/components/Button";
import { Sheet } from "@/ui/Sheet";

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
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) handleCancel();
      }}
      size="md"
      overlayProps={{ "data-testid": "confirm-modal-overlay" }}
      contentProps={{
        ...(!body ? { "aria-describedby": undefined } : {}),
        className: "bg-surface-container-lowest",
        onOpenAutoFocus: (event) => {
          event.preventDefault();
          cancelButtonRef.current?.focus();
        },
      }}
    >
      <Dialog.Title className="font-headline text-xl font-bold tracking-tight text-on-surface">{title}</Dialog.Title>
      {body ? (
        <Dialog.Description asChild>
          <div className="mt-2 break-words text-sm leading-6 text-on-surface-variant">{body}</div>
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
    </Sheet>
  );
}
