import { LogOut } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../services/supabaseClient";
import { useTranslation } from "../i18n/useTranslation";
import { faint, iconButton } from "../ui/styles";

/**
 * Who is signed in, and the way out.
 *
 * There is no sign-in form here any more: every page is behind the gate in
 * App.tsx, so by the time this renders there is always a session. The email is
 * hidden on a narrow screen — the log-out button is the part that has to fit.
 */
export default function UserMenu({ session }: { session: Session }) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      <span className={`hidden text-xs sm:inline ${faint}`}>{session.user.email}</span>
      <button
        type="button"
        onClick={() => void supabase.auth.signOut()}
        title={t("common.logout")}
        aria-label={t("common.logout")}
        className={iconButton}
      >
        <LogOut size={18} />
      </button>
    </div>
  );
}
