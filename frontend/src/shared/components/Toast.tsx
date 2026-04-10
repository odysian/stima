import { useEffect } from "react";

interface ToastProps {
  message: string | null;
  variant?: "success" | "error";
  onDismiss: () => void;
  durationMs?: number | null;
}

export function Toast({
  message,
  variant = "success",
  onDismiss,
  durationMs = 2500,
}: ToastProps): React.ReactElement | null {
  useEffect(() => {
    if (!message || durationMs === null) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      onDismiss();
    }, durationMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [durationMs, message, onDismiss]);

  if (!message) {
    return null;
  }

  const isError = variant === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      className={`fixed bottom-20 left-1/2 z-50 flex w-fit max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl px-4 py-2.5 text-sm ghost-shadow ${
        isError
          ? "border border-error/40 bg-error-container text-error"
          : "bg-on-surface text-background"
      }`}
    >
      <p className="min-w-0 truncate">{message}</p>
      {isError ? (
        <button
          type="button"
          aria-label="Dismiss"
          className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-base leading-none transition-colors hover:bg-error/15"
          onClick={onDismiss}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
