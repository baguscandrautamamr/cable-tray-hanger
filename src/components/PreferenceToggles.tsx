import { Languages, Moon, Sun } from "lucide-react";
import { LANGUAGES, LANGUAGE_LABELS, LANGUAGE_SHORT } from "../i18n/translations";
import { useTranslation } from "../i18n/useTranslation";
import { useTheme } from "../theme/useTheme";
import { iconButton } from "../ui/styles";

/**
 * Language and theme, side by side.
 *
 * Both live in the header of every page, the login screen included — somebody
 * who cannot read the sign-in form is exactly the person who needs the language
 * switch, and putting it behind the sign-in would be the one place it is no use.
 */
export default function PreferenceToggles() {
  const { language, setLanguage, t } = useTranslation();
  const { theme, toggleTheme } = useTheme();

  const nextLanguage = LANGUAGES[(LANGUAGES.indexOf(language) + 1) % LANGUAGES.length];
  const dark = theme === "dark";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setLanguage(nextLanguage)}
        // The label names the language being switched *to*, which is the one
        // the reader is looking for; the chip shows the one in force.
        title={`${t("common.language")}: ${LANGUAGE_LABELS[nextLanguage]}`}
        aria-label={`${t("common.language")}: ${LANGUAGE_LABELS[nextLanguage]}`}
        className={`${iconButton} w-auto gap-1.5 px-2.5 text-xs font-semibold`}
      >
        <Languages size={16} />
        {LANGUAGE_SHORT[language]}
      </button>

      <button
        type="button"
        onClick={toggleTheme}
        title={dark ? t("common.theme.toLight") : t("common.theme.toDark")}
        aria-label={dark ? t("common.theme.toLight") : t("common.theme.toDark")}
        className={iconButton}
      >
        {dark ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </div>
  );
}
