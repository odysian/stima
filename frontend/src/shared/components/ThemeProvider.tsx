import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
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
  const systemTheme = useSyncExternalStore(
    useCallback(
      (onStoreChange) => {
        if (preference !== "system") {
          return () => undefined;
        }

        return subscribeToSystemTheme(() => {
          onStoreChange();
        });
      },
      [preference],
    ),
    getSystemTheme,
    () => "light" as EffectiveTheme,
  );

  const effectiveTheme = resolveEffectiveTheme(preference, systemTheme);

  useEffect(() => {
    applyThemeToDocument(effectiveTheme, preference);
  }, [effectiveTheme, preference]);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    persistThemePreference(nextPreference);
    setPreferenceState(nextPreference);
    applyThemeToDocument(
      resolveEffectiveTheme(nextPreference, getSystemTheme()),
      nextPreference,
    );
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
