import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type ToastVariant = "success" | "error" | "info" | "warning";

export interface ToastShowOptions {
  message: string;
  variant?: ToastVariant;
  durationMs?: number | null;
  onDismiss?: () => void;
}

interface ToastRecord {
  id: number;
  message: string;
  variant: ToastVariant;
  durationMs: number | null;
  state: "open" | "closed";
}

interface ToastContextValue {
  show: (options: ToastShowOptions) => number;
  dismiss: (id: number) => void;
}

interface ToastProps {
  toast: ToastRecord;
  onDismiss: () => void;
}

const DEFAULT_DURATION_MS = 3500;
const EXIT_DURATION_MS = 200;
const MAX_VISIBLE_TOASTS = 3;

const toastStyleByVariant: Record<ToastVariant, { role: "status" | "alert"; icon: string; classes: string }> = {
  success: {
    role: "status",
    icon: "check_circle",
    classes: "bg-on-surface text-background",
  },
  info: {
    role: "status",
    icon: "info",
    classes: "bg-surface-container-highest text-on-surface",
  },
  warning: {
    role: "alert",
    icon: "warning",
    classes: "bg-warning-container text-warning",
  },
  error: {
    role: "alert",
    icon: "error",
    classes: "bg-error-container text-error",
  },
};

const ToastContext = createContext<ToastContextValue | null>(null);

function resolveDuration(variant: ToastVariant, durationMs: number | null | undefined): number | null {
  if (typeof durationMs === "number" || durationMs === null) {
    return durationMs;
  }
  return variant === "error" || variant === "warning" ? null : DEFAULT_DURATION_MS;
}

export function Toast({ toast, onDismiss }: ToastProps): React.ReactElement {
  const variantStyle = toastStyleByVariant[toast.variant];

  return (
    <article
      role={variantStyle.role}
      data-state={toast.state}
      className={[
        "pointer-events-auto w-full max-w-xl rounded-[var(--radius-document)] ghost-shadow px-4 py-3 text-sm transition-all duration-200",
        "data-[state=open]:translate-y-0 data-[state=open]:opacity-100",
        "data-[state=closed]:translate-y-2 data-[state=closed]:opacity-0",
        variantStyle.classes,
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="material-symbols-outlined text-[1.125rem] leading-none">
          {variantStyle.icon}
        </span>
        <p className="min-w-0 flex-1">{toast.message}</p>
        <button
          type="button"
          aria-label="Dismiss"
          className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-base leading-none transition-colors hover:bg-surface-container"
          onClick={onDismiss}
        >
          ×
        </button>
      </div>
    </article>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextIdRef = useRef(1);
  const dismissTimersRef = useRef(new Map<number, number>());
  const removeTimersRef = useRef(new Map<number, number>());
  const dismissCallbacksRef = useRef(new Map<number, () => void>());

  const dismiss = useCallback((id: number) => {
    const onDismiss = dismissCallbacksRef.current.get(id);
    if (onDismiss) {
      onDismiss();
      dismissCallbacksRef.current.delete(id);
    }
    setToasts((currentToasts) =>
      currentToasts.map((toast) => (toast.id === id ? { ...toast, state: "closed" } : toast)),
    );
  }, []);

  const show = useCallback((options: ToastShowOptions) => {
    const message = options.message.trim();
    if (!message) {
      return -1;
    }

    const id = nextIdRef.current;
    nextIdRef.current += 1;
    const variant = options.variant ?? "success";
    const nextToast: ToastRecord = {
      id,
      message,
      variant,
      durationMs: resolveDuration(variant, options.durationMs),
      state: "open",
    };
    if (options.onDismiss) {
      dismissCallbacksRef.current.set(id, options.onDismiss);
    }

    setToasts((currentToasts) => {
      const openToasts = currentToasts.filter((toast) => toast.state === "open");
      if (openToasts.length < MAX_VISIBLE_TOASTS) {
        return [...currentToasts, nextToast];
      }

      const oldestOpenToastId = openToasts[0]?.id;
      return [
        ...currentToasts.map((toast) =>
          toast.id === oldestOpenToastId ? { ...toast, state: "closed" as const } : toast,
        ),
        nextToast,
      ];
    });

    return id;
  }, []);

  useEffect(() => {
    for (const toast of toasts) {
      if (toast.state !== "open" || toast.durationMs === null || dismissTimersRef.current.has(toast.id)) {
        continue;
      }

      const timerId = window.setTimeout(() => {
        dismiss(toast.id);
      }, toast.durationMs);
      dismissTimersRef.current.set(toast.id, timerId);
    }

    const activeToastIds = new Set(toasts.map((toast) => toast.id));
    for (const [toastId, timerId] of dismissTimersRef.current.entries()) {
      if (activeToastIds.has(toastId)) {
        continue;
      }
      window.clearTimeout(timerId);
      dismissTimersRef.current.delete(toastId);
    }
  }, [dismiss, toasts]);

  useEffect(() => {
    for (const toast of toasts) {
      if (toast.state !== "closed" || removeTimersRef.current.has(toast.id)) {
        continue;
      }

      const timerId = window.setTimeout(() => {
        setToasts((currentToasts) => currentToasts.filter((candidate) => candidate.id !== toast.id));
      }, EXIT_DURATION_MS);
      removeTimersRef.current.set(toast.id, timerId);
    }

    const activeToastIds = new Set(toasts.map((toast) => toast.id));
    for (const [toastId, timerId] of removeTimersRef.current.entries()) {
      if (activeToastIds.has(toastId)) {
        continue;
      }
      window.clearTimeout(timerId);
      removeTimersRef.current.delete(toastId);
    }
  }, [toasts]);

  useEffect(() => {
    const dismissTimers = dismissTimersRef.current;
    const removeTimers = removeTimersRef.current;
    const dismissCallbacks = dismissCallbacksRef.current;
    return () => {
      dismissTimers.forEach((timerId) => window.clearTimeout(timerId));
      dismissTimers.clear();
      removeTimers.forEach((timerId) => window.clearTimeout(timerId));
      removeTimers.clear();
      dismissCallbacks.clear();
    };
  }, []);

  const contextValue = useMemo(() => ({ show, dismiss }), [dismiss, show]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <section
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+var(--bottom-nav-offset,0px))] left-0 right-0 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </section>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
