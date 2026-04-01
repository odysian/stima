export const THEME_STORAGE_KEY = "stima-theme";
export const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";
export const THEME_PREFERENCES = ["system", "light", "dark"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type EffectiveTheme = Exclude<ThemePreference, "system">;

const THEME_BACKGROUND = {
  light: "#f8f9ff",
  dark: "#0b1013",
} satisfies Record<EffectiveTheme, string>;

const THEME_FOREGROUND = {
  light: "#0d1c2e",
  dark: "#eef2ef",
} satisfies Record<EffectiveTheme, string>;

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && THEME_PREFERENCES.includes(value as ThemePreference);
}

export function sanitizeThemePreference(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : "system";
}

function getThemeStorage(storage?: Storage | null): Storage | null {
  try {
    if (storage !== undefined) {
      return storage;
    }

    if (typeof window === "undefined") {
      return null;
    }

    return window.localStorage;
  } catch {
    return null;
  }
}

export function getStoredThemePreference(storage = getThemeStorage()): ThemePreference {
  if (!storage) {
    return "system";
  }

  try {
    const storedPreference = storage.getItem(THEME_STORAGE_KEY);
    if (storedPreference === null) {
      return "system";
    }

    const preference = sanitizeThemePreference(storedPreference);
    if (preference === "system" && storedPreference !== "system") {
      storage.removeItem(THEME_STORAGE_KEY);
    }

    return preference;
  } catch {
    return "system";
  }
}

export function persistThemePreference(
  preference: ThemePreference,
  storage = getThemeStorage(),
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Ignore storage failures so theme changes still apply for the session.
  }
}

export function getSystemTheme(
  matchMedia = typeof window === "undefined" ? undefined : window.matchMedia,
): EffectiveTheme {
  if (typeof matchMedia !== "function") {
    return "light";
  }

  return matchMedia(THEME_MEDIA_QUERY).matches ? "dark" : "light";
}

export function resolveEffectiveTheme(
  preference: ThemePreference,
  systemTheme = getSystemTheme(),
): EffectiveTheme {
  return preference === "system" ? systemTheme : preference;
}

export function applyThemeToDocument(
  theme: EffectiveTheme,
  documentRef = document,
): void {
  const root = documentRef.documentElement;

  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.style.backgroundColor = THEME_BACKGROUND[theme];
  root.style.color = THEME_FOREGROUND[theme];
}

type ThemeMediaListener = (event: MediaQueryListEvent) => void;

export function subscribeToSystemTheme(
  onChange: (theme: EffectiveTheme) => void,
  matchMedia = typeof window === "undefined" ? undefined : window.matchMedia,
): () => void {
  if (typeof matchMedia !== "function") {
    return () => undefined;
  }

  const mediaQueryList = matchMedia(THEME_MEDIA_QUERY);
  const listener: ThemeMediaListener = (event) => {
    onChange(event.matches ? "dark" : "light");
  };

  if (typeof mediaQueryList.addEventListener === "function") {
    mediaQueryList.addEventListener("change", listener);

    return () => {
      mediaQueryList.removeEventListener("change", listener);
    };
  }

  const legacyListener = listener as unknown as (this: MediaQueryList, event: MediaQueryListEvent) => void;
  mediaQueryList.addListener(legacyListener);

  return () => {
    mediaQueryList.removeListener(legacyListener);
  };
}
