import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmModal } from "@/shared/components/ConfirmModal";

describe("ConfirmModal", () => {
  it("renders title, body, and action labels", () => {
    render(
      <ConfirmModal
        title="Leave this screen?"
        body="Your clips and notes will be lost."
        confirmLabel="Leave"
        cancelLabel="Stay"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Leave this screen?" })).toBeInTheDocument();
    expect(screen.getByText("Your clips and notes will be lost.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stay" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stay" })).toHaveFocus();
  });

  it("fires onConfirm when confirm button is clicked", () => {
    const onConfirm = vi.fn();

    render(
      <ConfirmModal
        title="Leave this screen?"
        confirmLabel="Leave"
        cancelLabel="Stay"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Leave" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("fires onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn();

    render(
      <ConfirmModal
        title="Leave this screen?"
        confirmLabel="Leave"
        cancelLabel="Stay"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Stay" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders destructive confirm styling when requested", () => {
    render(
      <ConfirmModal
        title="Delete quote?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        variant="destructive"
      />,
    );

    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("bg-secondary", "text-white");
  });

  it("renders primary confirm styling by default", () => {
    render(
      <ConfirmModal
        title="Leave this screen?"
        confirmLabel="Leave"
        cancelLabel="Stay"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Leave" })).toHaveClass("forest-gradient", "text-white");
  });

  it("dismisses the modal when Escape is pressed", () => {
    const onCancel = vi.fn();

    render(
      <ConfirmModal
        title="Leave this screen?"
        confirmLabel="Leave"
        cancelLabel="Stay"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: "Stay" }), { key: "Escape" });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
