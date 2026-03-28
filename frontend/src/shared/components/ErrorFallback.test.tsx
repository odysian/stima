import * as Sentry from "@sentry/react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorFallback } from "@/shared/components/ErrorFallback";

function ThrowError(): never {
  throw new Error("boom");
}

describe("ErrorFallback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders when an unhandled React error reaches the boundary", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
        <ThrowError />
      </Sentry.ErrorBoundary>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
