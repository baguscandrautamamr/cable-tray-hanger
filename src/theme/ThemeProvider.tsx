import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ThemeContext } from "./ThemeContext";
import type { Theme, ThemeContextValue } from "./ThemeContext";

const STORAGE_KEY = "cth.theme";

/**
 * Light unless the reader has chosen dark.
 *
 * Deliberately not `prefers-color-scheme`: this is a drawing-office tool used
 * beside Revit's own light interface and printed from, so white is what it
 * should open on. The system preference is a reasonable default for a reading
 * app and the wrong one here; the toggle is one click away either way.
 */
function storedTheme(): Theme {
  if (typeof window === "undefined") return "light";

  try {
    return window.localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    // Private browsing can refuse localStorage outright.
    return "light";
  }
}

function remember(theme: Theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The choice still applies to this tab; it just will not be remembered.
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(storedTheme);

  useEffect(() => {
    const root = document.documentElement;

    // The class drives every `dark:` utility in the app — see the
    // @custom-variant in index.css. `color-scheme` is what makes the browser's
    // own furniture (scrollbars, form controls, the canvas behind the page)
    // match; without it a dark page keeps white scrollbars.
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    remember(next);
  }, []);

  const toggleTheme = useCallback(
    () =>
      setThemeState((current) => {
        const next = current === "dark" ? "light" : "dark";
        remember(next);
        return next;
      }),
    [],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
