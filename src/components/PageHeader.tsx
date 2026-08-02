import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { useTranslation } from "../i18n/useTranslation";
import PreferenceToggles from "./PreferenceToggles";
import UserMenu from "./UserMenu";
import { faint, heading } from "../ui/styles";

interface PageHeaderProps {
  title: string;

  /** The line under the title. A node rather than a string so a page can emphasise part of it. */
  subtitle?: ReactNode;

  /** Where the back arrow goes. Omitted on the page it would point at. */
  backTo?: string;

  /** Page-specific buttons, shown before the language and theme toggles. */
  actions?: ReactNode;

  session: Session;
}

/**
 * The same header on every page: where you are, what you can do here, and the
 * three things that follow you around — language, theme, and the way out.
 */
export default function PageHeader({
  title,
  subtitle,
  backTo,
  actions,
  session,
}: PageHeaderProps) {
  const { t } = useTranslation();

  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        {backTo && (
          <Link
            to={backTo}
            title={t("common.back")}
            aria-label={t("common.back")}
            className={`${faint} hover:text-slate-900 dark:hover:text-slate-200`}
          >
            <ArrowLeft size={20} />
          </Link>
        )}
        <div>
          <h1 className={`text-2xl font-semibold ${heading}`}>{title}</h1>
          {subtitle && <p className={`text-sm ${faint}`}>{subtitle}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {actions}
        <PreferenceToggles />
        <UserMenu session={session} />
      </div>
    </header>
  );
}
