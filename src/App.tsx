import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./services/supabaseClient";
import { LanguageProvider } from "./i18n/LanguageProvider";
import { useTranslation } from "./i18n/useTranslation";
import { ThemeProvider } from "./theme/ThemeProvider";
import Dashboard from "./pages/Dashboard";
import Config from "./pages/Config";
import ApiKeys from "./pages/ApiKeys";
import Login from "./pages/Login";
import { muted } from "./ui/styles";

// Only a placeholder for the moment before a scan arrives — the real project
// name travels with the scan, so this no longer has to match the add-in's
// Settings dialog by hand.
const FALLBACK_PROJECT_NAME = import.meta.env.VITE_PROJECT_NAME ?? "";

function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <BrowserRouter>
          <AuthGate />
        </BrowserRouter>
      </LanguageProvider>
    </ThemeProvider>
  );
}

/**
 * Nothing renders until we know who is asking.
 *
 * The pages used to render signed-out, showing a login box and a "log in to see
 * your history" line in place of each section. That put the shape of the whole
 * app in front of somebody with no account, and left every page carrying a
 * branch for a state it should never be in. One gate here means a page can take
 * a `Session`, not a `Session | null`, and stop asking.
 *
 * `resolved` is separate from `session` because "not signed in" and "we have
 * not looked yet" are different answers, and showing the login form during the
 * moment between them flashes it at somebody who is already signed in.
 */
function AuthGate() {
  const { t } = useTranslation();

  const [session, setSession] = useState<Session | null>(null);
  const [resolved, setResolved] = useState(!isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setResolved(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setResolved(true);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  if (!isSupabaseConfigured) {
    return <NotConfigured />;
  }

  if (!resolved) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <p className={`text-sm ${muted}`}>{t("login.checking")}</p>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  return (
    <Routes>
      <Route path="/" element={<Dashboard session={session} />} />
      <Route
        path="/config"
        element={<Config session={session} fallbackProjectName={FALLBACK_PROJECT_NAME} />}
      />
      <Route path="/api-keys" element={<ApiKeys session={session} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/**
 * Without the two VITE_ variables there is no auth to gate on and no data to
 * show, so this replaces the app rather than sitting above it as a banner —
 * a login form that cannot reach a server is worse than an explanation.
 */
function NotConfigured() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="flex max-w-md flex-col gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-5">
        <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-300">
          <AlertTriangle size={20} />
          {t("setup.title")}
        </div>
        <p className="text-sm text-amber-900 dark:text-amber-100/90">{t("setup.body")}</p>
        <p className="text-xs text-amber-800/80 dark:text-amber-200/70">{t("setup.keyWarning")}</p>
      </div>
    </div>
  );
}

export default App;
