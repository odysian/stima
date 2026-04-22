import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PageTransition } from "@/ui/PageTransition";

type StartViewTransition = (updateCallback: () => void) => unknown;

function renderWithRouter(initialPath = "/"): void {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<PageTransition />}>
          <Route
            path="/"
            element={
              <>
                <h1>Quotes</h1>
                <Link to="/review">Go review</Link>
              </>
            }
          />
          <Route path="/review" element={<h1>Review</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  Reflect.deleteProperty(document, "startViewTransition");
  vi.useRealTimers();
});

describe("PageTransition", () => {
  it("navigates without view transition support", async () => {
    const user = userEvent.setup();
    renderWithRouter("/");

    expect(screen.getByRole("heading", { name: "Quotes" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Go review" }));

    expect(screen.getByRole("heading", { name: "Review" })).toBeInTheDocument();
  });

  it("wraps navigation in document.startViewTransition when available", async () => {
    const startViewTransition = vi.fn((updateCallback: () => void) => {
      updateCallback();
      return {};
    });
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: startViewTransition as StartViewTransition,
    });

    const user = userEvent.setup();
    renderWithRouter("/");

    await user.click(screen.getByRole("link", { name: "Go review" }));

    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Review" })).toBeInTheDocument();
  });

  it("falls back to normal navigation when startViewTransition does not run callback", async () => {
    const startViewTransition = vi.fn(() => ({}));
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: startViewTransition as StartViewTransition,
    });

    const user = userEvent.setup();
    renderWithRouter("/");

    await user.click(screen.getByRole("link", { name: "Go review" }));

    expect(startViewTransition).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Review" })).toBeInTheDocument();
    });
  });
});
