import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DocumentSelectionFooter } from "@/features/quotes/components/DocumentSelectionFooter";

describe("DocumentSelectionFooter", () => {
  it("shows count and cancel action when nothing is selected", () => {
    const onCancelSelection = vi.fn();

    render(
      <DocumentSelectionFooter
        selectedCount={0}
        onCancelSelection={onCancelSelection}
      />,
    );

    expect(screen.getByText("0 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancelSelection).toHaveBeenCalledTimes(1);
  });

  it("shows archive and more actions when one or more are selected", async () => {
    const onCancelSelection = vi.fn();
    const onArchiveSelection = vi.fn();
    const onDeleteSelectionPermanently = vi.fn();

    render(
      <DocumentSelectionFooter
        selectedCount={2}
        onCancelSelection={onCancelSelection}
        onArchiveSelection={onArchiveSelection}
        onDeleteSelectionPermanently={onDeleteSelectionPermanently}
      />,
    );

    expect(screen.getByText("2 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(onArchiveSelection).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete permanently..." }));
    expect(onDeleteSelectionPermanently).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Cancel selection" }));
    expect(onCancelSelection).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("menu", { name: "More selection actions" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "More selection actions" })).not.toBeInTheDocument();
    });
  });
});
