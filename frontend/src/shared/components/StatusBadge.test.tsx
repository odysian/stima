import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "@/shared/components/StatusBadge";

describe("StatusBadge", () => {
  it("renders draft variant styles", () => {
    render(<StatusBadge variant="draft" />);

    expect(screen.getByText("Draft")).toHaveClass("bg-slate-100", "text-slate-600");
  });

  it("renders ready variant styles", () => {
    render(<StatusBadge variant="ready" />);

    expect(screen.getByText("Ready")).toHaveClass("bg-emerald-100", "text-emerald-800");
  });

  it("renders shared variant styles", () => {
    render(<StatusBadge variant="shared" />);

    expect(screen.getByText("Shared")).toHaveClass("bg-sky-100", "text-sky-800");
  });
});
