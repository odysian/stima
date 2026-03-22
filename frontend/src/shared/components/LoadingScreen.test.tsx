import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LoadingScreen } from "@/shared/components/LoadingScreen";

describe("LoadingScreen", () => {
  it("renders token-based container and spinner classes", () => {
    const { container } = render(<LoadingScreen />);

    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveClass("bg-background", "text-primary");

    const spinner = wrapper?.firstElementChild;
    expect(spinner).toHaveClass("border-surface-dim", "border-t-current");
  });
});
