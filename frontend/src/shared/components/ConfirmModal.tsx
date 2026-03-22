import { useId } from "react";

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
  primary: "forest-gradient text-white",
  destructive: "bg-secondary text-white",
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
  const titleId = useId();
  const bodyId = useId();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 px-4 pb-4 sm:items-center sm:pb-0">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={body ? bodyId : undefined}
        className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-[0_24px_64px_rgba(13,28,46,0.24)]"
      >
        <h2 id={titleId} className="font-headline text-xl font-bold tracking-tight text-on-surface">
          {title}
        </h2>
        {body ? (
          <p id={bodyId} className="mt-2 text-sm leading-6 text-on-surface-variant">
            {body}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
          <button
            type="button"
            className={`inline-flex min-h-12 flex-1 items-center justify-center rounded-lg px-4 py-3 text-sm font-semibold transition-all active:scale-[0.98] ${confirmButtonClasses[variant]}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-4 py-3 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-low"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
