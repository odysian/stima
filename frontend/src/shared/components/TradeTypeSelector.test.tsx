import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TradeTypeSelector } from "@/shared/components/TradeTypeSelector";

const options = ["Plumber", "Electrician", "Builder", "Painter", "Landscaper", "Other"] as const;

describe("TradeTypeSelector", () => {
  it("renders all six trade options", () => {
    render(<TradeTypeSelector options={options} value="Plumber" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Plumber" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Electrician" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Builder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Painter" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Landscaper" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Other" })).toBeInTheDocument();
  });

  it("highlights selected option and fires onChange", () => {
    const onChange = vi.fn();
    render(<TradeTypeSelector options={options} value="Builder" onChange={onChange} />);

    expect(screen.getByRole("button", { name: "Builder" })).toHaveClass(
      "ghost-shadow",
      "border-selection-ring",
      "bg-surface-container-lowest",
      "text-on-surface",
    );
    expect(screen.getByRole("button", { name: "Plumber" })).toHaveClass(
      "border-outline-variant/50",
      "bg-surface-container-low",
      "text-on-surface-variant",
    );

    fireEvent.click(screen.getByRole("button", { name: "Painter" }));
    expect(onChange).toHaveBeenCalledWith("Painter");
  });
});
