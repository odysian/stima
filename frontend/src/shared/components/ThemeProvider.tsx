import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { ThemeContext, type ThemeContextValue } from "@/shared/lib/theme-context";
import {
  applyThemeToDocument,
  getStoredThemePreference,
  getSystemTheme,
  persistThemePreference,
  resolveEffectiveTheme,
  subscribeToSystemTheme,
  type EffectiveTheme,
  type ThemePreference,
} from "@/shared/lib/theme";

export function ThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => getStoredThemePreference());
  const [systemTheme, setSystemTheme] = useState<EffectiveTheme>(() => getSystemTheme());

  useEffect(() => {
    if (preference !== "system") {
      return;
    }

    setSystemTheme(getSystemTheme());

    return subscribeToSystemTheme(setSystemTheme);
  }, [preference]);

  const effectiveTheme = resolveEffectiveTheme(preference, systemTheme);

  useEffect(() => {
    applyThemeToDocument(effectiveTheme);
  }, [effectiveTheme]);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    persistThemePreference(nextPreference);
    setPreferenceState(nextPreference);
    applyThemeToDocument(resolveEffectiveTheme(nextPreference, getSystemTheme()));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      effectiveTheme,
      setPreference,
    }),
    [effectiveTheme, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
