import { createContext } from "react";

import type { EffectiveTheme, ThemePreference } from "@/shared/lib/theme";

export interface ThemeContextValue {
  preference: ThemePreference;
  effectiveTheme: EffectiveTheme;
  setPreference: (preference: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
