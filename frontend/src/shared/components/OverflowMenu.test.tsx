import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OverflowMenu } from "@/shared/components/OverflowMenu";

describe("OverflowMenu", () => {
  it("closes on item select and restores focus to the trigger", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <OverflowMenu
        items={[
          {
            label: "Delete Quote",
            icon: "delete",
            onSelect,
          },
        ]}
      />,
    );

    const trigger = screen.getByRole("button", { name: /more actions/i });
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: /delete quote/i }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });

  it("closes on outside click and escape", async () => {
    const user = userEvent.setup();

    render(
      <>
        <button type="button">Outside</button>
        <OverflowMenu
          items={[
            {
              label: "Copy Share Link",
              icon: "content_copy",
              onSelect: vi.fn(),
            },
          ]}
        />
      </>,
    );

    const trigger = screen.getByRole("button", { name: /more actions/i });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Outside" }));

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });

    await user.click(trigger);
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });

  it("closes when focus tabs outside the menu container", async () => {
    const user = userEvent.setup();

    render(
      <>
        <OverflowMenu
          items={[
            {
              label: "Copy Share Link",
              icon: "content_copy",
              onSelect: vi.fn(),
            },
          ]}
        />
        <button type="button">After</button>
      </>,
    );

    const trigger = screen.getByRole("button", { name: /more actions/i });
    await user.click(trigger);

    await user.tab();
    expect(screen.getByRole("menuitem", { name: /copy share link/i })).toHaveFocus();

    await user.tab();

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
    });
  });

  it("renders a compact menu panel with left-aligned action rows", async () => {
    const user = userEvent.setup();

    render(
      <OverflowMenu
        items={[
          {
            label: "Delete Customer",
            icon: "delete",
            onSelect: vi.fn(),
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /more actions/i }));

    const menu = screen.getByRole("menu");
    const row = screen.getByRole("menuitem", { name: /delete customer/i });

    expect(menu).toHaveClass("w-52");
    expect(row).toHaveClass("grid");
    expect(row).toHaveClass("grid-cols-[1.25rem_minmax(0,1fr)]");
  });
});
