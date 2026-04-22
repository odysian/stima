import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToastProvider, useToast } from "@/ui/Toast";

function ToastTestHarness(): React.ReactElement {
  const { show } = useToast();

  return (
    <div>
      <button type="button" onClick={() => show({ message: "Saved", variant: "success" })}>
        Show success
      </button>
      <button type="button" onClick={() => show({ message: "Heads up", variant: "warning" })}>
        Show warning
      </button>
      <button type="button" onClick={() => show({ message: "Failed", variant: "error" })}>
        Show error
      </button>
      <button type="button" onClick={() => show({ message: "FYI", variant: "info" })}>
        Show info
      </button>
      <button
        type="button"
        onClick={() => {
          show({ message: "One", variant: "info", durationMs: null });
          show({ message: "Two", variant: "info", durationMs: null });
          show({ message: "Three", variant: "info", durationMs: null });
          show({ message: "Four", variant: "info", durationMs: null });
        }}
      >
        Show queue
      </button>
    </div>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ToastProvider", () => {
  it("renders queued toasts with region live updates and variant semantics", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastTestHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show success" }));
    fireEvent.click(screen.getByRole("button", { name: "Show info" }));
    fireEvent.click(screen.getByRole("button", { name: "Show warning" }));
    fireEvent.click(screen.getByRole("button", { name: "Show error" }));

    expect(screen.getByText("Saved").closest("article")).toHaveAttribute("data-state", "closed");
    expect(screen.getByText("FYI")).toBeInTheDocument();
    expect(screen.getByText("Heads up")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toHaveClass("bg-warning-container", "text-warning");
    expect(alerts[1]).toHaveClass("bg-error-container", "text-error");
    expect(screen.getByText("FYI").closest("article")).toHaveClass(
      "bg-surface-container-highest",
      "text-on-surface",
    );

    const region = screen.getByText("FYI").closest("section");
    expect(region).toHaveAttribute("aria-live", "polite");
  });

  it("auto-dismisses success and info toasts after 3500ms", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastTestHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show success" }));
    expect(screen.getByText("Saved")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.getByText("Saved").closest("article")).toHaveAttribute("data-state", "closed");

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("keeps warning and error toasts until manually dismissed", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastTestHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show warning" }));
    fireEvent.click(screen.getByRole("button", { name: "Show error" }));

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(screen.getByText("Heads up")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();

    const dismissButtons = screen.getAllByRole("button", { name: /dismiss/i });
    fireEvent.click(dismissButtons[0]);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText("Heads up")).not.toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("caps visible toasts at 3 and closes the oldest", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastTestHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show queue" }));

    expect(screen.queryByText("One")).toBeInTheDocument();
    expect(screen.getByText("Two")).toBeInTheDocument();
    expect(screen.getByText("Three")).toBeInTheDocument();
    expect(screen.getByText("Four")).toBeInTheDocument();
    expect(screen.getByText("One").closest("article")).toHaveAttribute("data-state", "closed");

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText("One")).not.toBeInTheDocument();
    expect(screen.getByText("Two")).toBeInTheDocument();
    expect(screen.getByText("Three")).toBeInTheDocument();
    expect(screen.getByText("Four")).toBeInTheDocument();
  });
});
