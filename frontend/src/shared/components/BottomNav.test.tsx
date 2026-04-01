import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BottomNav } from "@/shared/components/BottomNav";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("BottomNav", () => {
  it("renders quotes, customers, and settings tabs", () => {
    render(<BottomNav active="quotes" />);

    expect(screen.getByRole("button", { name: /quotes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /customers/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByText("description")).toBeInTheDocument();
    expect(screen.getByText("group")).toBeInTheDocument();
    expect(screen.getByText("settings")).toBeInTheDocument();
  });

  it("applies active tab styling using the active prop", () => {
    render(<BottomNav active="customers" />);

    expect(screen.getByRole("navigation")).toHaveClass(
      "glass-surface-strong",
      "glass-shadow-top",
      "border-outline-variant/20",
    );
    expect(screen.getByRole("button", { name: /customers/i })).toHaveClass("text-primary");
    expect(screen.getByRole("button", { name: /quotes/i })).toHaveClass("text-outline");
  });

  it("navigates to the expected routes on tab click", () => {
    render(<BottomNav active="quotes" />);

    fireEvent.click(screen.getByRole("button", { name: /quotes/i }));
    fireEvent.click(screen.getByRole("button", { name: /customers/i }));
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));

    expect(navigateMock).toHaveBeenNthCalledWith(1, "/");
    expect(navigateMock).toHaveBeenNthCalledWith(2, "/customers");
    expect(navigateMock).toHaveBeenNthCalledWith(3, "/settings");
  });
});
