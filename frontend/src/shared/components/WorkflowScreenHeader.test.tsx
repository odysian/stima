import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkflowScreenHeader } from "@/shared/components/WorkflowScreenHeader";

describe("WorkflowScreenHeader", () => {
  it("renders the exit-to-home action when provided", () => {
    const onBack = vi.fn();
    const onExitHome = vi.fn();

    render(
      <WorkflowScreenHeader
        title="Capture Job Notes"
        onBack={onBack}
        onExitHome={onExitHome}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    fireEvent.click(screen.getByRole("button", { name: /exit to home/i }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onExitHome).toHaveBeenCalledTimes(1);
  });
});
