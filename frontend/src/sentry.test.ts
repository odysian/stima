import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const init = vi.fn();
const captureException = vi.fn();

vi.mock("@sentry/react", () => ({
  init,
  captureException,
}));

describe("sentry bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    init.mockReset();
    captureException.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is a no-op when no DSN is configured", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "");

    const sentry = await import("@/sentry");
    sentry.initializeSentry();

    expect(init).not.toHaveBeenCalled();
  });

  it("initializes Sentry with safe defaults when a DSN is configured", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://public@example.ingest.sentry.io/1");

    const sentry = await import("@/sentry");
    sentry.initializeSentry();

    expect(init).toHaveBeenCalledWith({
      dsn: "https://public@example.ingest.sentry.io/1",
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });
  });
});
