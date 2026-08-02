import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { LANGUAGES, TRANSLATIONS } from "./translations";
import type { Language } from "./translations";
import { LanguageContext } from "./LanguageContext";
import type { LanguageContextValue } from "./LanguageContext";

const STORAGE_KEY = "cth.language";

function isLanguage(value: string | null): value is Language {
  return value !== null && (LANGUAGES as readonly string[]).includes(value);
}

/**
 * English unless the reader has said otherwise, or their browser is set to
 * Indonesian. The stored choice wins over the browser, because somebody who has
 * picked a language once has answered the question.
 */
function initialLanguage(): Language {
  if (typeof window === "undefined") return "en";

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    // Private browsing can refuse localStorage outright. Not a reason to fail
    // to render a page.
  }

  return window.navigator.language?.toLowerCase().startsWith("id") ? "id" : "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  useEffect(() => {
    // Screen readers and the browser's own translation prompt both read this,
    // so it has to follow the toggle rather than stay at the index.html value.
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice still applies to this tab; it just will not be remembered.
    }
  }, []);

  const t = useCallback<LanguageContextValue["t"]>(
    (key, vars) => {
      // English is the fallback, so a key missing from a translation shows the
      // sentence rather than the key.
      const template = TRANSLATIONS[language][key] ?? TRANSLATIONS.en[key] ?? key;

      if (!vars) return template;

      return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
        name in vars ? String(vars[name]) : whole,
      );
    },
    [language],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
