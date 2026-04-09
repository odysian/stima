import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AIConfidenceBanner } from "@/shared/components/AIConfidenceBanner";

describe("AIConfidenceBanner", () => {
  it("renders message and confidence note styling", () => {
    const { container } = render(
      <AIConfidenceBanner message="Please verify line item quantities before sharing." />,
    );

    expect(screen.getByText("AI Confidence Note")).toBeInTheDocument();
    expect(screen.getByText("Please verify line item quantities before sharing.")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("ghost-shadow", "bg-warning-container");
  });

  it("supports a dismiss action when provided", () => {
    const onDismiss = vi.fn();

    render(
      <AIConfidenceBanner
        message="Double-check quantity assumptions."
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /dismiss confidence note/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
