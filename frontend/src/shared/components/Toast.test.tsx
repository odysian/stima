import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Toast } from "@/shared/components/Toast";

afterEach(() => {
  vi.useRealTimers();
});

describe("Toast", () => {
  it("does not render when message is null", () => {
    render(<Toast message={null} onDismiss={vi.fn()} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders success variant and auto-dismisses after the default timeout", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    render(<Toast message="Saved" onDismiss={onDismiss} />);

    const toast = screen.getByRole("status");
    expect(toast).toHaveClass(
      "toast-safe-bottom",
      "fixed",
      "left-1/2",
      "-translate-x-1/2",
      "rounded-xl",
      "px-4",
      "py-2.5",
      "text-sm",
      "ghost-shadow",
      "bg-on-surface",
      "text-background",
    );
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /dismiss/i })).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("renders persistent error variant with manual dismiss only", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    render(<Toast message="Extraction failed" variant="error" durationMs={null} onDismiss={onDismiss} />);

    const toast = screen.getByRole("alert");
    expect(toast).toHaveClass("bg-error-container", "border", "border-error/40", "text-error");

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("keeps the original auto-dismiss schedule when onDismiss callback identity changes", () => {
    vi.useFakeTimers();
    const firstDismiss = vi.fn();
    const secondDismiss = vi.fn();

    const { rerender } = render(<Toast message="Saved" onDismiss={firstDismiss} />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    rerender(<Toast message="Saved" onDismiss={secondDismiss} />);

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(firstDismiss).not.toHaveBeenCalled();
    expect(secondDismiss).toHaveBeenCalledTimes(1);
  });
});
