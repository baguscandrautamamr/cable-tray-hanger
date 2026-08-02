import { createContext } from "react";

export type Theme = "light" | "dark";

export interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

/** Its own file, away from the provider component, so Fast Refresh keeps working. */
export const ThemeContext = createContext<ThemeContextValue | null>(null);
