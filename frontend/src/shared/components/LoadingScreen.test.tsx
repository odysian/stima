import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LoadingScreen } from "@/shared/components/LoadingScreen";

describe("LoadingScreen", () => {
  it("renders a branded loading shell with token-based styling", () => {
    const { container } = render(<LoadingScreen />);

    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveClass("screen-radial-backdrop", "text-on-surface");
    expect(screen.getByText("Stima")).toHaveClass("font-headline", "text-primary");

    const statusRegion = screen.getByRole("status", { name: /loading app/i });
    expect(statusRegion).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Preparing your workspace...")).toHaveClass("text-on-surface-variant");

    const spinner = statusRegion.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
    expect(statusRegion.querySelector(".border-surface-dim")).not.toBeInTheDocument();

    const movingDots = spinner?.querySelectorAll("span");
    expect(movingDots).toHaveLength(2);
    expect(movingDots?.[0]).toHaveClass("bg-primary", "rounded-full");
    expect(movingDots?.[1]).toHaveClass("bg-primary/65", "rounded-full");
  });
});
