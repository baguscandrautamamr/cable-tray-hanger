import {
  ArrowUpDown,
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
import type { CableTray, PlacementPosition, ScanRecord, StatusAlertData } from "../types";
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

const DEFAULT_HEIGHT_MM = 500;

interface HangerConfigFormProps {
  session: Session | null;
  /** Reports the scanned project name upwards, so the page header can show it. */
  onProjectName?: (projectName: string) => void;
  onSaved?: () => void;
}

/** A tray with its placement worked out, mirroring what the server will store. */
interface PlannedTray {
  tray: CableTray;
  positions: PlacementPosition[];
}

export default function HangerConfigForm({
  session,
  onProjectName,
  onSaved,
}: HangerConfigFormProps) {
  const [scan, setScan] = useState<ScanRecord | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [hangerFamilyName, setHangerFamilyName] = useState("");
  const [spacingMm, setSpacingMm] = useState(1500);
  const [heightMm, setHeightMm] = useState(DEFAULT_HEIGHT_MM);
  const [alert, setAlert] = useState<StatusAlertData | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The trays and families come from the model, not from this file.
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
        if (latest) onProjectName?.(latest.project_name);
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
  }, [session, onProjectName]);

  const hangerFamilies = useMemo(() => scan?.hanger_families ?? [], [scan]);

  // A cleared or out-of-range spacing would make calculatePlacements throw
  // during render, so hold the preview empty until the value is usable.
  const spacingValid = Number.isFinite(spacingMm) && spacingMm >= MIN_SPACING_MM;
  const heightValid = Number.isFinite(heightMm) && heightMm > 0;

  // Trays that already carry hangers keep whatever height they were revised to
  // in Revit, so they are reported and then left alone.
  const skippedTrays = useMemo(
    () => (scan?.cable_trays ?? []).filter((tray) => (tray.existing_hanger_count ?? 0) > 0),
    [scan],
  );

  // Every remaining tray is planned — there is nothing to pick. Selecting runs
  // one at a time was the slow part of the job.
  const plannedTrays = useMemo<PlannedTray[]>(() => {
    if (!scan || !spacingValid) return [];

    return scan.cable_trays.flatMap((tray) => {
      if ((tray.existing_hanger_count ?? 0) > 0) return [];

      const elbows = scan.elbows.filter((elbow) => elbow.cable_tray_id === tray.id);

      try {
        return [{ tray, positions: calculatePlacements(tray.length_m, spacingMm, elbows) }];
      } catch {
        // A zero-length stub, say. The server reports these by name; the
        // preview simply leaves them out.
        return [];
      }
    });
  }, [scan, spacingValid, spacingMm]);

  const allPositions = useMemo(
    () => plannedTrays.flatMap((planned) => planned.positions),
    [plannedTrays],
  );

  const stats = useMemo(() => summarizePlacements(allPositions), [allPositions]);

  async function handlePush() {
    if (!scan || !hangerFamilyName || !session || !spacingValid || !heightValid) return;

    setSubmitting(true);
    setAlert(null);
    try {
      const result = await submitHangerConfig({
        scan_id: scan.id,
        hanger_family_name: hangerFamilyName,
        spacing_mm: spacingMm,
        hanger_height_mm: heightMm,
      });
      setAlert({ kind: "success", message: result.message });
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
    setHangerFamilyName("");
    setSpacingMm(1500);
    setHeightMm(DEFAULT_HEIGHT_MM);
    setAlert(null);
  }

  const canPush = Boolean(
    session && plannedTrays.length > 0 && hangerFamilyName && spacingValid && heightValid && !submitting,
  );

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

      {scan && scan.hanger_families.length === 0 && (
        <StatusAlert
          kind="pending"
          message={
            "No Cable Tray Fitting families are loaded in this project, so there is nothing to " +
            "place. Load the hanger family, then scan again."
          }
        />
      )}

      {/* The keyword matched nothing, so the list below is every cable tray
          fitting rather than a narrowed one. Saying so beats an empty dropdown. */}
      {scan && scan.hanger_families_matched_keyword === false && scan.hanger_families.length > 0 && (
        <StatusAlert
          kind="pending"
          message={
            `No family name contains "${scan.hanger_family_keyword}", so all ` +
            `${scan.hanger_families.length} Cable Tray Fitting families are listed below rather ` +
            "than just the hangers. Pick yours — or set a keyword that matches it in the add-in's " +
            "Settings, which is also how the add-in recognises hangers already in the model and " +
            "leaves them alone."
          }
        />
      )}

      {skippedTrays.length > 0 && (
        <StatusAlert
          kind="info"
          message={
            `${skippedTrays.length} of ${scan?.cable_trays.length} trays already carry hangers ` +
            "and are left untouched, so any height you revised in Revit survives: " +
            skippedTrays
              .map(
                (tray) =>
                  `${tray.name} (${tray.existing_hanger_count}` +
                  (tray.existing_hanger_height_mm ? ` at ${tray.existing_hanger_height_mm}mm` : "") +
                  ")",
              )
              .join(", ") +
            "."
          }
        />
      )}

      {/* 2. Cable trays in this config — every one of them, no picking */}
      <section className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <Cable size={22} className="text-sky-400" />
          Cable Trays ({plannedTrays.length})
        </label>
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">Tray</th>
                <th className="px-4 py-2 font-medium">Length</th>
                <th className="px-4 py-2 font-medium">Width</th>
                <th className="px-4 py-2 font-medium">Hangers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {plannedTrays.map(({ tray, positions }) => (
                <tr key={tray.id}>
                  <td className="px-4 py-2 text-slate-200">{tray.name}</td>
                  <td className="px-4 py-2 text-slate-400">{tray.length_m.toFixed(2)}m</td>
                  {/* Width is not an input: the hanger has to span the tray. */}
                  <td className="px-4 py-2 text-slate-400">
                    {tray.width_mm ? `${Math.round(tray.width_mm)}mm` : "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-200">{positions.length}</td>
                </tr>
              ))}
              {plannedTrays.length === 0 && (
                <tr>
                  <td className="px-4 py-3 text-slate-500" colSpan={4}>
                    No trays to place.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">
          Every scanned tray is included. Hanger width follows each tray's own width.
        </p>
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
            {hangerFamilies.length
              ? "Select hanger family..."
              : "No Cable Tray Fitting families scanned yet"}
          </option>
          {hangerFamilies.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}
              {f.category ? ` — ${f.category}` : ""} ({f.type_count}{" "}
              {f.type_count === 1 ? "type" : "types"})
            </option>
          ))}
        </select>
        <p className="text-xs text-amber-400">
          Cable Tray Fitting families loaded in this project — that is what a cable tray hanger is
          built as.
        </p>
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

      {/* 5. Hanger Height — the one dimension the model cannot supply */}
      <section className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <ArrowUpDown size={22} className="text-sky-400" />
          Hanger Height (mm)
        </label>
        <input
          type="number"
          min={1}
          step={50}
          value={heightMm}
          onChange={(e) => setHeightMm(Number(e.target.value))}
          className="w-40 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-400"
        />
        {heightValid ? (
          <p className="text-xs text-slate-500">
            Written onto the hangers this config creates. Hangers already in the model keep the
            height they have, so a revision made in Revit is never overwritten.
          </p>
        ) : (
          <p className="text-xs text-red-400">Enter a height greater than 0.</p>
        )}
      </section>

      {/* 6. Placement Preview Stats */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={<Plus size={18} className="text-sky-400" />} label="Total Hangers" value={stats.total} />
        <StatCard icon={<MapPin size={18} className="text-emerald-400" />} label="At Elbows" value={stats.atElbows} />
        <StatCard icon={<Ruler size={18} className="text-violet-400" />} label="At Spacing" value={stats.atSpacing} />
        <StatCard icon={<Check size={18} className="text-amber-400" />} label="Start/End" value={stats.startEnd} />
      </section>

      {/* 7. Per-tray detail and visualization */}
      {plannedTrays.map(({ tray, positions }) => (
        <section key={tray.id} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-slate-200">
            {tray.name}{" "}
            <span className="font-normal text-slate-500">
              — {positions.length} hangers, {tray.length_m.toFixed(2)}m
            </span>
          </h3>
          <PreviewTable
            positions={positions}
            elbowPositionsM={(scan?.elbows ?? [])
              .filter((elbow) => elbow.cable_tray_id === tray.id)
              .map((elbow) => elbow.position_m)}
          />
          <VisualizationCanvas totalLengthM={tray.length_m} positions={positions} />
        </section>
      ))}

      {/* 8. Action Buttons */}
      <section className="flex gap-3">
        <button
          onClick={handlePush}
          disabled={!canPush}
          className="inline-flex items-center gap-1.5 rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send size={18} />
          {submitting ? "Pushing..." : `Push ${stats.total} hangers to Revit`}
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
