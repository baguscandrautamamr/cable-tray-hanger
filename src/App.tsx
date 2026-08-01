import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./services/supabaseClient";
import Dashboard from "./pages/Dashboard";
import Config from "./pages/Config";
import ApiKeys from "./pages/ApiKeys";

const PROJECT_NAME = import.meta.env.VITE_PROJECT_NAME ?? "HBE-ELECTRICAL-E";

function App() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  return (
    <BrowserRouter>
      {!isSupabaseConfigured && (
        <div className="bg-amber-500 px-4 py-3 text-center text-sm font-medium text-slate-950">
          <p>
            Supabase not configured — set <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code>, then rebuild.
          </p>
          {/* These are baked into the bundle at build time, so on a deployed
              site they live in the host's settings, not in a file — and saving
              them is not enough without a redeploy. */}
          <p className="mt-0.5 text-xs font-normal text-slate-900/80">
            Locally: <code>.env.local</code>. On Vercel: Settings → Environment Variables, then
            redeploy. These are separate from the server-side <code>SUPABASE_URL</code> /{" "}
            <code>SUPABASE_SERVICE_ROLE_KEY</code>; use the <strong>anon</strong> key here, never
            the service role.
          </p>
        </div>
      )}
      <Routes>
        <Route path="/" element={<Dashboard session={session} />} />
        <Route
          path="/config"
          element={<Config session={session} projectName={PROJECT_NAME} />}
        />
        <Route path="/api-keys" element={<ApiKeys session={session} />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
