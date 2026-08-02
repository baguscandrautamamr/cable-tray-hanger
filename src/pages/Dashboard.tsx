import { KeyRound, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import type { HangerConfig, ScanRecord } from "../types";
import { supabase } from "../services/supabaseClient";
import { fetchLatestScan } from "../services/apiClient";
import { useTranslation } from "../i18n/useTranslation";
import HistoryTable from "../components/HistoryTable";
import PageHeader from "../components/PageHeader";
import StatusAlert from "../components/StatusAlert";
import { muted, primaryButton, secondaryButton } from "../ui/styles";

interface DashboardProps {
  session: Session;
}

export default function Dashboard({ session }: DashboardProps) {
  const { t } = useTranslation();

  const [configs, setConfigs] = useState<HangerConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanRecord | null>(null);

  // The project shown here is the one the add-in scanned under, so the header
  // reflects Revit rather than a build-time constant.
  useEffect(() => {
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
      <PageHeader
        session={session}
        title={t("app.title")}
        subtitle={
          scan
            ? t("dash.scanned", {
                project: scan.project_name,
                view: scan.view_name || t("dash.unnamedView"),
                count: scan.cable_trays.length,
              })
            : t("dash.subtitle")
        }
        actions={
          <>
            <Link to="/api-keys" className={secondaryButton}>
              <KeyRound size={18} />
              {t("dash.apiKeys")}
            </Link>
            <Link to="/config" className={primaryButton}>
              <Plus size={18} />
              {t("dash.newConfig")}
            </Link>
          </>
        }
      />

      {loading ? (
        <p className={`text-sm ${muted}`}>{t("common.loading")}</p>
      ) : loadError ? (
        <StatusAlert kind="failed" message={t("dash.loadError", { message: loadError })} />
      ) : (
        <HistoryTable configs={configs} />
      )}
    </div>
  );
}
