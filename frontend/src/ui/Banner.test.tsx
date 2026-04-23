import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Banner } from "@/ui/Banner";

describe("Banner", () => {
  it("renders title and message", () => {
    render(<Banner title="Heads up" message="Something happened." />);
    expect(screen.getByText("Heads up")).toBeInTheDocument();
    expect(screen.getByText("Something happened.")).toBeInTheDocument();
  });

  it.each(["warn", "info", "success", "error"] as const)("renders %s kind without error", (kind) => {
    render(<Banner title="Title" message="Msg" kind={kind} />);
    expect(screen.getByText("Title")).toBeInTheDocument();
  });

  it("renders dismiss button when onDismiss provided", () => {
    render(<Banner title="T" message="M" onDismiss={vi.fn()} dismissLabel="Close banner" />);
    expect(screen.getByRole("button", { name: "Close banner" })).toBeInTheDocument();
  });

  it("calls onDismiss when dismiss button clicked", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<Banner title="T" message="M" onDismiss={onDismiss} dismissLabel="Close banner" />);
    await user.click(screen.getByRole("button", { name: "Close banner" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("does not render dismiss button when onDismiss absent", () => {
    render(<Banner title="T" message="M" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
