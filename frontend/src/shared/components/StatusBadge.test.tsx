import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "@/shared/components/StatusBadge";

describe("StatusBadge", () => {
  it("renders draft variant styles", () => {
    render(<StatusBadge variant="draft" />);

    expect(screen.getByText("Draft")).toHaveClass("bg-neutral-container", "text-on-surface-variant");
  });

  it("renders ready variant styles", () => {
    render(<StatusBadge variant="ready" />);

    expect(screen.getByText("Ready")).toHaveClass("bg-success-container", "text-success");
  });

  it("renders shared variant styles", () => {
    render(<StatusBadge variant="shared" />);

    expect(screen.getByText("Shared")).toHaveClass("bg-info-container", "text-info");
  });
});
