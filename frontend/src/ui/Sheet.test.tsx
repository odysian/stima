import { useRef, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import * as Dialog from "@radix-ui/react-dialog";

import { Sheet, SheetBody, SheetCloseButton, SheetFooter, SheetHeader } from "@/ui/Sheet";

function Harness(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const firstActionRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open sheet
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        size="md"
        overlayProps={{ "data-testid": "sheet-overlay" }}
        contentProps={{
          onOpenAutoFocus: (event) => {
            event.preventDefault();
            firstActionRef.current?.focus();
          },
        }}
      >
        <SheetHeader>
          <div>
            <Dialog.Title className="font-headline text-xl font-bold tracking-tight text-on-surface">
              Test sheet
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-on-surface-variant">
              Sheet description
            </Dialog.Description>
          </div>
          <SheetCloseButton />
        </SheetHeader>
        <SheetBody>
          <button ref={firstActionRef} type="button">
            First action
          </button>
          <button type="button">Second action</button>
        </SheetBody>
        <SheetFooter>
          <button type="button">Footer action</button>
        </SheetFooter>
      </Sheet>
    </>
  );
}

describe("Sheet", () => {
  it("renders dialog content when open and dismisses via overlay", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Open sheet" }));
    expect(screen.getByRole("dialog", { name: "Test sheet" })).toBeInTheDocument();

    await user.click(screen.getByTestId("sheet-overlay"));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Test sheet" })).not.toBeInTheDocument();
    });
  });

  it("traps focus while open and restores focus to opener on escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const openButton = screen.getByRole("button", { name: "Open sheet" });
    await user.click(openButton);

    expect(screen.getByRole("button", { name: "First action" })).toHaveFocus();

    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();

    expect(openButton).not.toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(openButton).toHaveFocus();
    });
  });
});
