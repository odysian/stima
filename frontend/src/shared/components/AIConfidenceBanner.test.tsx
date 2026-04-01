import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AIConfidenceBanner } from "@/shared/components/AIConfidenceBanner";

describe("AIConfidenceBanner", () => {
  it("renders message and confidence note styling", () => {
    const { container } = render(
      <AIConfidenceBanner message="Please verify line item quantities before sharing." />,
    );

    expect(screen.getByText("AI Confidence Note")).toBeInTheDocument();
    expect(screen.getByText("Please verify line item quantities before sharing.")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("ghost-shadow", "bg-warning-container");

    const icon = screen.getByText("info");
    expect(icon).toHaveClass("material-symbols-outlined", "text-warning-accent");
    expect((icon as HTMLElement).style.fontVariationSettings).toBe('"FILL" 1, "wght" 400, "GRAD" 0, "opsz" 24');
  });
});
