import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Eyebrow } from "@/ui/Eyebrow";

describe("Eyebrow", () => {
  it("keeps base size when only text color override is provided", () => {
    render(<Eyebrow className="text-warning">Label</Eyebrow>);

    const label = screen.getByText("Label");
    expect(label).toHaveClass("text-[0.6875rem]");
    expect(label).toHaveClass("text-warning");
    expect(label).not.toHaveClass("text-outline");
  });

  it("keeps base color when only text size override is provided", () => {
    render(<Eyebrow className="text-xs">Label</Eyebrow>);

    const label = screen.getByText("Label");
    expect(label).toHaveClass("text-xs");
    expect(label).toHaveClass("text-outline");
    expect(label).not.toHaveClass("text-[0.6875rem]");
  });

  it("drops base size and color when both size and color overrides are provided", () => {
    render(<Eyebrow className="text-xs text-warning">Label</Eyebrow>);

    const label = screen.getByText("Label");
    expect(label).toHaveClass("text-xs");
    expect(label).toHaveClass("text-warning");
    expect(label).not.toHaveClass("text-[0.6875rem]");
    expect(label).not.toHaveClass("text-outline");
  });

  it("keeps base size and color when no text override is provided", () => {
    render(<Eyebrow>Label</Eyebrow>);

    const label = screen.getByText("Label");
    expect(label).toHaveClass("text-[0.6875rem]");
    expect(label).toHaveClass("text-outline");
  });
});
