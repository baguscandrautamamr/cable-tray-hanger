import { useContext } from "react";
import { LanguageContext } from "./LanguageContext";
import type { LanguageContextValue } from "./LanguageContext";

/**
 * The current language and its `t`.
 *
 * Throws rather than falling back to English when no provider is above it: a
 * component rendered outside the provider would otherwise ignore the toggle
 * silently, in one corner of one page, which is the kind of bug nobody finds.
 */
export function useTranslation(): LanguageContextValue {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useTranslation must be used inside <LanguageProvider>");
  }

  return context;
}
