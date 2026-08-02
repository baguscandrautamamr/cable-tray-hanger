import { createContext } from "react";
import type { Language, TranslationKey } from "./translations";

/** Values a `{placeholder}` in a translation can be filled with. */
export type TranslationVars = Record<string, string | number>;

export interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, vars?: TranslationVars) => string;
}

/**
 * Its own file, away from the provider component: a module that exports both a
 * component and something else defeats Fast Refresh, so editing a translation
 * would reload the whole app instead of the page.
 */
export const LanguageContext = createContext<LanguageContextValue | null>(null);
