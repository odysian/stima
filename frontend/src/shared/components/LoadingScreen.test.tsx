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
    expect(spinner).toHaveClass("border-surface-dim", "border-t-primary");
  });
});
