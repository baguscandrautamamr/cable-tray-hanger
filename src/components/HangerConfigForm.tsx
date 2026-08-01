import {
  Cable,
  Check,
  MapPin,
  Plus,
  Ruler,
  Send,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { ScanRecord, StatusAlertData } from "../types";
import {
  MIN_SPACING_MM,
  calculatePlacements,
  summarizePlacements,
} from "../services/placementAlgorithm";
import { fetchLatestScan, submitHangerConfig } from "../services/apiClient";
import AuthSection from "./AuthSection";
import PreviewTable from "./PreviewTable";
import StatusAlert from "./StatusAlert";
import VisualizationCanvas from "./VisualizationCanvas";

interface HangerConfigFormProps {
  session: Session | null;
  projectName: string;
  onSaved?: () => void;
}

export default function HangerConfigForm({
  session,
  projectName,
  onSaved,
}: HangerConfigFormProps) {
  const [scan, setScan] = useState<ScanRecord | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [cableTrayId, setCableTrayId] = useState<number | "">("");
  const [hangerFamilyName, setHangerFamilyName] = useState("");
  const [spacingMm, setSpacingMm] = useState(1500);
  const [alert, setAlert] = useState<StatusAlertData | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The trays and families come from the model, not from this file. Before the
  // scan was stored server-side this form listed hard-coded placeholders, so
  // pressing "Scan Cable Tray" in Revit changed nothing here.
  useEffect(() => {
    if (!session) {
      setScan(null);
      setScanError(null);
      return;
    }

    let cancelled = false;
    setScanLoading(true);
    setScanError(null);

    fetchLatestScan()
      .then((latest) => {
        if (cancelled) return;
        setScan(latest);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setScanError(err instanceof Error ? err.message : "Could not load the latest scan");
      })
      .finally(() => {
        if (!cancelled) setScanLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  const cableTrays = useMemo(() => scan?.cable_trays ?? [], [scan]);
  const hangerFamilies = useMemo(() => scan?.hanger_families ?? [], [scan]);

  const cableTray = useMemo(
    () => cableTrays.find((ct) => ct.id === cableTrayId) ?? null,
    [cableTrays, cableTrayId],
  );

  // position_m is measured along the tray the add-in matched the fitting to, so
  // an elbow is only meaningful next to that tray. Elbows from an add-in build
  // that did not record cable_tray_id cannot be attributed and are left out
  // rather than applied to the wrong run.
  const elbows = useMemo(
    () =>
      cableTray
        ? (scan?.elbows ?? []).filter((elbow) => elbow.cable_tray_id === cableTray.id)
        : [],
    [scan, cableTray],
  );

  // A cleared or out-of-range spacing input would make calculatePlacements
  // throw during render, so hold the preview empty until the value is usable.
  const spacingValid = Number.isFinite(spacingMm) && spacingMm >= MIN_SPACING_MM;

  const positions = useMemo(() => {
    if (!cableTray || !spacingValid) return [];
    return calculatePlacements(cableTray.length_m, spacingMm, elbows);
  }, [cableTray, spacingValid, spacingMm, elbows]);

  const stats = useMemo(() => summarizePlacements(positions), [positions]);

  async function handlePush() {
    if (!cableTray || !hangerFamilyName || !session || !spacingValid) return;

    setSubmitting(true);
    setAlert(null);
    try {
      const result = await submitHangerConfig({
        project_name: projectName,
        cable_tray_id: cableTray.id,
        cable_tray_name: cableTray.name,
        cable_tray_length_m: cableTray.length_m,
        hanger_family_name: hangerFamilyName,
        spacing_mm: spacingMm,
        elbows,
        timestamp: new Date().toISOString(),
      });
      setAlert({
        kind: "success",
        message: `Config saved! Waiting for add-in sync... (${result.total_hangers} hangers)`,
      });
      onSaved?.();
    } catch (err) {
      setAlert({
        kind: "failed",
        message: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    setCableTrayId("");
    setHangerFamilyName("");
    setSpacingMm(1500);
    setAlert(null);
  }

  const canPush = Boolean(
    session && cableTray && hangerFamilyName && spacingValid && !submitting,
  );

  // The add-in polls for configs by its own project name, so a config pushed
  // under a different one is never collected and Sync Hangers just reports
  // "No pending configuration". Nothing else in the system notices.
  const projectMismatch = scan !== null && scan.project_name !== projectName;

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Auth Section */}
      <AuthSection session={session} />

      {/* 1b. Where the model data came from, and what is wrong with it */}
      {session && scanLoading && (
        <p className="text-sm text-slate-500">Loading the latest scan from Revit...</p>
      )}

      {session && scanError && (
        <StatusAlert kind="failed" message={`Could not load the latest scan: ${scanError}`} />
      )}

      {session && !scanLoading && !scanError && !scan && (
        <StatusAlert
          kind="info"
          message={
            "No scan from Revit yet. Open a view showing the cable tray run and press " +
            "Scan Cable Tray on the Cable Tray Hanger ribbon, then reload this page."
          }
        />
      )}

      {scan && (
        <p className="text-xs text-slate-500">
          Scanned from <span className="text-slate-300">{scan.view_name || "an unnamed view"}</span>{" "}
          in <span className="text-slate-300">{scan.project_name}</span> —{" "}
          {scan.cable_trays.length} trays, {scan.elbows.length} elbows,{" "}
          {scan.hanger_families.length} hanger families.
        </p>
      )}

      {projectMismatch && (
        <StatusAlert
          kind="failed"
          message={
            `Project name mismatch. This scan came from "${scan.project_name}", but the web app ` +
            `is set to "${projectName}". A config pushed from here is filed under ` +
            `"${projectName}", which the add-in never polls for — Sync Hangers would keep ` +
            "reporting \"No pending configuration\". Set VITE_PROJECT_NAME to " +
            `"${scan.project_name}" and redeploy, or change Project name in the add-in's Settings.`
          }
        />
      )}

      {scan && scan.hanger_families.length === 0 && (
        <StatusAlert
          kind="pending"
          message={
            "The scan found no hanger families in the model, so there is nothing to place. " +
            "Revit has no hanger category, so the add-in matches on a name substring — widen " +
            "or clear \"Hanger family keyword\" in its Settings dialog, or load a hanger family " +
            "into the project, then scan again."
          }
        />
      )}

      {/* 2. Cable Tray Selection */}
      <section className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <Cable size={22} className="text-sky-400" />
          Cable Tray
        </label>
        <select
          value={cableTrayId}
          onChange={(e) => setCableTrayId(e.target.value ? Number(e.target.value) : "")}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-400"
        >
          <option value="">
            {cableTrays.length ? "Select cable tray..." : "No cable trays scanned yet"}
          </option>
          {cableTrays.map((ct) => (
            <option key={ct.id} value={ct.id}>
              {ct.name} ({ct.length_m.toFixed(2)}m{ct.level ? `, ${ct.level}` : ""})
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500">Auto-scanned from Revit active view</p>
      </section>

      {/* 3. Hanger Family Selection */}
      <section className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <Wrench size={22} className="text-sky-400" />
          Hanger Family
        </label>
        <select
          value={hangerFamilyName}
          onChange={(e) => setHangerFamilyName(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-400"
        >
          <option value="">
            {hangerFamilies.length ? "Select hanger family..." : "No hanger families scanned yet"}
          </option>
          {hangerFamilies.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name} ({f.type_count} {f.type_count === 1 ? "type" : "types"})
            </option>
          ))}
        </select>
        <p className="text-xs text-amber-400">Auto-detected from project</p>
      </section>

      {/* 4. Hanger Spacing Config */}
      <section className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <Ruler size={22} className="text-sky-400" />
          Hanger Spacing (mm)
        </label>
        <input
          type="number"
          min={500}
          max={3000}
          step={100}
          value={spacingMm}
          onChange={(e) => setSpacingMm(Number(e.target.value))}
          className="w-40 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-400"
        />
        {spacingValid ? (
          <p className="text-xs text-slate-500">
            Guideline spacing. Elbow positions are forced.
          </p>
        ) : (
          <p className="text-xs text-red-400">
            Enter a spacing of at least {MIN_SPACING_MM}mm to preview placement.
          </p>
        )}
      </section>

      {/* 5. Placement Preview Stats */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={<Plus size={18} className="text-sky-400" />} label="Total Hangers" value={stats.total} />
        <StatCard icon={<MapPin size={18} className="text-emerald-400" />} label="At Elbows" value={stats.atElbows} />
        <StatCard icon={<Ruler size={18} className="text-violet-400" />} label="At Spacing" value={stats.atSpacing} />
        <StatCard icon={<Check size={18} className="text-amber-400" />} label="Start/End" value={stats.startEnd} />
      </section>

      {/* 6. Placement Detail Table */}
      <section>
        <h3 className="mb-2 text-sm font-medium text-slate-200">Placement Detail</h3>
        <PreviewTable
          positions={positions}
          elbowPositionsM={elbows.map((e) => e.position_m)}
        />
      </section>

      {/* 7. Visualization Canvas */}
      <section>
        <h3 className="mb-2 text-sm font-medium text-slate-200">Visualization</h3>
        <VisualizationCanvas totalLengthM={cableTray?.length_m ?? 0} positions={positions} />
      </section>

      {/* 8. Action Buttons */}
      <section className="flex gap-3">
        <button
          onClick={handlePush}
          disabled={!canPush}
          className="inline-flex items-center gap-1.5 rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send size={18} />
          {submitting ? "Pushing..." : "Push to Revit"}
        </button>
        <button
          onClick={handleCancel}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          <X size={18} />
          Cancel
        </button>
      </section>

      {alert && <StatusAlert kind={alert.kind} message={alert.message} />}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        {icon}
        {label}
      </div>
      <span className="text-2xl font-semibold text-slate-100">{value}</span>
    </div>
  );
}
