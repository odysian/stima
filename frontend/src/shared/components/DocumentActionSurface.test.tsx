import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DocumentActionSurface } from "@/shared/components/DocumentActionSurface";

describe("DocumentActionSurface", () => {
  it("renders utility actions even when no utility label is provided", () => {
    render(
      <DocumentActionSurface
        sectionLabel="Quote actions"
        primaryAction={<button type="button">Primary</button>}
        utilityActions={<button type="button">Copy Link</button>}
      />,
    );

    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
    expect(screen.getByRole("group")).not.toHaveAttribute("aria-label");
  });

  it("applies the utility label when provided", () => {
    render(
      <DocumentActionSurface
        sectionLabel="Quote actions"
        primaryAction={<button type="button">Primary</button>}
        utilityActions={<button type="button">Copy Link</button>}
        utilityLabel="Quote utilities"
      />,
    );

    expect(screen.getByRole("group", { name: /quote utilities/i })).toBeInTheDocument();
  });
});
