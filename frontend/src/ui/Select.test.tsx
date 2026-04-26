import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Select } from "@/ui/Select";

describe("Select", () => {
  it("renders label, hint, and selected value", () => {
    render(
      <Select id="theme" label="Theme" value="light" onChange={vi.fn()} hint="Choose your app theme">
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </Select>,
    );

    const select = screen.getByLabelText("Theme");
    expect(select).toHaveValue("light");
    expect(select).toHaveClass("min-h-[var(--tap-target-min)]", "py-0");
    expect(select).toHaveAttribute("aria-describedby", "theme-hint");
    expect(screen.getByText("Choose your app theme")).toHaveAttribute("id", "theme-hint");
  });

  it("supports invalid visuals and onChange", () => {
    const onChange = vi.fn();
    render(
      <Select id="trade" label="Trade" value="builder" onChange={onChange} error="Required" invalid>
        <option value="builder">Builder</option>
        <option value="plumber">Plumber</option>
      </Select>,
    );

    fireEvent.change(screen.getByLabelText("Trade"), { target: { value: "plumber" } });

    expect(onChange).toHaveBeenCalled();
    expect(screen.getByLabelText("Trade")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Required")).toBeInTheDocument();
  });
});
