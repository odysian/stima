import * as Sentry from "@sentry/react";

let initializedDsn: string | null = null;

export function initializeSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn || dsn === initializedDsn) {
    return;
  }

  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
  initializedDsn = dsn;
}

export function captureException(error: unknown): void {
  Sentry.captureException(error);
}
