import { KeyRound, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import type { HangerConfig, ScanRecord } from "../types";
import { supabase } from "../services/supabaseClient";
import { fetchLatestScan } from "../services/apiClient";
import HistoryTable from "../components/HistoryTable";
import AuthSection from "../components/AuthSection";
import StatusAlert from "../components/StatusAlert";

interface DashboardProps {
  session: Session | null;
}

export default function Dashboard({ session }: DashboardProps) {
  const [configs, setConfigs] = useState<HangerConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanRecord | null>(null);

  // The project shown here is the one the add-in scanned under, so the header
  // reflects Revit rather than a build-time constant.
  useEffect(() => {
    if (!session) {
      setScan(null);
      return;
    }

    let cancelled = false;

    fetchLatestScan()
      .then((latest) => {
        if (!cancelled) setScan(latest);
      })
      .catch(() => {
        // The header is decoration; the configuration list below is the page.
        // A failure there is already reported.
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!session) {
      setConfigs([]);
      setLoadError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    supabase
      .from("hanger_configs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (cancelled) return;
        // A failed query used to render as an empty table, which reads exactly
        // like "no configs yet" — the one state that needs a different action.
        if (error) {
          setLoadError(error.message);
          setConfigs([]);
        } else {
          setConfigs((data ?? []) as HangerConfig[]);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Cable Tray Hanger</h1>
          {scan ? (
            <p className="text-sm text-slate-500">
              <span className="text-slate-300">{scan.project_name}</span> — last scanned from{" "}
              {scan.view_name || "an unnamed view"}, {scan.cable_trays.length} trays
            </p>
          ) : (
            <p className="text-sm text-slate-500">Recent hanger configurations</p>
          )}
        </div>
        <div className="flex items-center gap-2">
        <Link
          to="/api-keys"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          <KeyRound size={18} />
          API Keys
        </Link>
        <Link
          to="/config"
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400"
        >
          <Plus size={18} />
          New Config
        </Link>
        </div>
      </header>

      <AuthSection session={session} />

      {session ? (
        loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : loadError ? (
          <StatusAlert kind="failed" message={`Could not load your configurations: ${loadError}`} />
        ) : (
          <HistoryTable configs={configs} />
        )
      ) : (
        <p className="text-sm text-slate-500">Login to view your configuration history.</p>
      )}
    </div>
  );
}
