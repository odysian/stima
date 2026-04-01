import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScreenFooter } from "@/shared/components/ScreenFooter";

describe("ScreenFooter", () => {
  it("uses shared glass chrome classes", () => {
    const { container } = render(
      <ScreenFooter>
        <button type="button">Save</button>
      </ScreenFooter>,
    );

    expect(container.querySelector("footer")).toHaveClass(
      "glass-surface",
      "glass-shadow-bottom",
      "border-outline-variant/20",
    );
  });
});
