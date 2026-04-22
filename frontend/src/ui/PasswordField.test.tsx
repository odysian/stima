import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PasswordField } from "@/ui/PasswordField";

describe("PasswordField", () => {
  it("toggles visibility and aria-pressed state", () => {
    render(
      <PasswordField
        id="password"
        label="Password"
        value="secret"
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Password");
    const toggle = screen.getByRole("button", { name: /show password/i });

    expect(input).toHaveAttribute("type", "password");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggle);

    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: /hide password/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
