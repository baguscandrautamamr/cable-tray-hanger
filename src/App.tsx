import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./services/supabaseClient";
import Dashboard from "./pages/Dashboard";
import Config from "./pages/Config";

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
        <div className="bg-amber-500 px-4 py-2 text-center text-sm font-medium text-slate-950">
          Supabase not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in
          .env.local
        </div>
      )}
      <Routes>
        <Route path="/" element={<Dashboard session={session} />} />
        <Route
          path="/config"
          element={<Config session={session} projectName={PROJECT_NAME} />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
