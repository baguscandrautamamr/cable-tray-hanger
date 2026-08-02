import { useContext } from "react";
import { ThemeContext } from "./ThemeContext";
import type { ThemeContextValue } from "./ThemeContext";

/** The current theme and the two ways to change it. */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }

  return context;
}
