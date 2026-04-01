import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScreenHeader } from "@/shared/components/ScreenHeader";

describe("ScreenHeader", () => {
  it("renders without a back button when onBack is omitted", () => {
    const { container } = render(<ScreenHeader title="Settings" />);

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /back/i })).not.toBeInTheDocument();
    expect(container.querySelector("header")).toHaveClass(
      "glass-surface",
      "glass-shadow-top",
      "border-outline-variant/20",
    );
  });

  it("renders and wires the back button when onBack is provided", () => {
    const onBack = vi.fn();
    render(<ScreenHeader title="Quote Preview" onBack={onBack} />);

    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
