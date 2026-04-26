import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PwaUpdatePrompt } from "@/shared/components/PwaUpdatePrompt";

const { useRegisterSWMock } = vi.hoisted(() => ({
  useRegisterSWMock: vi.fn(),
}));

vi.mock(
  "virtual:pwa-register/react",
  () => ({
    useRegisterSW: useRegisterSWMock,
  }),
);

describe("PwaUpdatePrompt", () => {
  it("returns null when no refresh is needed", () => {
    useRegisterSWMock.mockReturnValue({
      needRefresh: [false],
      updateServiceWorker: vi.fn(),
    });

    const { container } = render(<PwaUpdatePrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders and triggers service-worker reload when refresh is needed", () => {
    const updateServiceWorker = vi.fn();
    useRegisterSWMock.mockReturnValue({
      needRefresh: [true],
      updateServiceWorker,
    });

    const { container } = render(<PwaUpdatePrompt />);
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));

    expect(screen.getByText("New version available.")).toBeInTheDocument();
    expect(container.querySelector("aside")).toHaveClass(
      "top-[calc(4rem+env(safe-area-inset-top)+0.75rem)]",
    );
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });
});
