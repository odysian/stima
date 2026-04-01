import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/shared/components/ThemeProvider";
import { useTheme } from "@/shared/hooks/useTheme";
import {
  THEME_STORAGE_KEY,
  applyThemeToDocument,
  getStoredThemePreference,
  resolveEffectiveTheme,
} from "@/shared/lib/theme";

interface MatchMediaController {
  setMatches: (matches: boolean) => void;
}

function installMatchMediaMock(initialMatches = false): MatchMediaController {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  let matches = initialMatches;

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      get matches() {
        return matches;
      },
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addEventListener: (_eventName: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_eventName: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
      addListener: (listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
      removeListener: (listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
      dispatchEvent: vi.fn(),
    })),
  });

  return {
    setMatches(nextMatches) {
      matches = nextMatches;

      for (const listener of listeners) {
        listener({
          matches: nextMatches,
          media: "(prefers-color-scheme: dark)",
        } as MediaQueryListEvent);
      }
    },
  };
}

function ThemeHarness(): React.ReactElement {
  const { preference, effectiveTheme, setPreference } = useTheme();

  return (
    <div>
      <p>Preference: {preference}</p>
      <p>Effective: {effectiveTheme}</p>
      <button type="button" onClick={() => setPreference("dark")}>
        Use Dark
      </button>
      <button type="button" onClick={() => setPreference("system")}>
        Use System
      </button>
    </div>
  );
}

describe("theme helpers", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "";
    document.documentElement.style.backgroundColor = "";
    document.documentElement.style.color = "";
  });

  it("falls back to system and clears invalid saved preferences", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "midnight");

    expect(getStoredThemePreference()).toBe("system");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("resolves system preferences with the current OS theme", () => {
    expect(resolveEffectiveTheme("system", "dark")).toBe("dark");
    expect(resolveEffectiveTheme("system", "light")).toBe("light");
    expect(resolveEffectiveTheme("dark", "light")).toBe("dark");
  });

  it("applies the effective theme to the html element", () => {
    applyThemeToDocument("dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(document.documentElement.style.backgroundColor).toBe("rgb(11, 16, 19)");
  });
});

describe("ThemeProvider", () => {
  it("follows live OS changes while the preference is system", async () => {
    const matchMedia = installMatchMediaMock(false);

    render(
      <ThemeProvider>
        <ThemeHarness />
      </ThemeProvider>,
    );

    expect(screen.getByText("Preference: system")).toBeInTheDocument();
    expect(screen.getByText("Effective: light")).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("light");

    await act(async () => {
      matchMedia.setMatches(true);
    });

    await waitFor(() => {
      expect(screen.getByText("Effective: dark")).toBeInTheDocument();
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("keeps an explicit preference even if the OS theme changes", async () => {
    const user = userEvent.setup();
    const matchMedia = installMatchMediaMock(false);

    render(
      <ThemeProvider>
        <ThemeHarness />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Use Dark" }));

    expect(screen.getByText("Preference: dark")).toBeInTheDocument();
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    await act(async () => {
      matchMedia.setMatches(true);
    });

    await waitFor(() => {
      expect(screen.getByText("Effective: dark")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Use System" }));

    await act(async () => {
      matchMedia.setMatches(false);
    });

    await waitFor(() => {
      expect(screen.getByText("Preference: system")).toBeInTheDocument();
      expect(screen.getByText("Effective: light")).toBeInTheDocument();
    });
  });
});
