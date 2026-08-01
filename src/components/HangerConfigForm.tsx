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
import { useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type {
  CableTray,
  Elbow,
  HangerFamily,
  StatusAlertData,
} from "../types";
import {
  MIN_SPACING_MM,
  calculatePlacements,
  summarizePlacements,
} from "../services/placementAlgorithm";
import { submitHangerConfig } from "../services/apiClient";
import AuthSection from "./AuthSection";
import PreviewTable from "./PreviewTable";
import StatusAlert from "./StatusAlert";
import VisualizationCanvas from "./VisualizationCanvas";

// Placeholder data until Phase 2 add-in scan (POST /api/scan-cable-tray) is wired up.
const SAMPLE_CABLE_TRAYS: CableTray[] = [
  { id: 123456, name: "CT-L1-RUN-01", level: "L2", length_m: 45.5 },
  { id: 123457, name: "CT-L1-RUN-02", level: "L2", length_m: 30.2 },
];

const SAMPLE_HANGER_FAMILIES: HangerFamily[] = [
  { name: "Hanger - Rod 10mm - Steel - Clamp", type_count: 5 },
  { name: "Rod Hanger Type A", type_count: 2 },
];

const SAMPLE_ELBOWS_BY_TRAY: Record<number, Elbow[]> = {
  123456: [
    { position_m: 1.48 },
    { position_m: 4.2 },
    { position_m: 12.8 },
    { position_m: 22.3 },
    { position_m: 35.6 },
  ],
  123457: [{ position_m: 6.5 }, { position_m: 18.0 }],
};

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
  const [cableTrayId, setCableTrayId] = useState<number | "">("");
  const [hangerFamilyName, setHangerFamilyName] = useState("");
  const [spacingMm, setSpacingMm] = useState(1500);
  const [alert, setAlert] = useState<StatusAlertData | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const cableTray = useMemo(
    () => SAMPLE_CABLE_TRAYS.find((ct) => ct.id === cableTrayId) ?? null,
    [cableTrayId],
  );

  const elbows = useMemo(
    () => (cableTray ? SAMPLE_ELBOWS_BY_TRAY[cableTray.id] ?? [] : []),
    [cableTray],
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

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Auth Section */}
      <AuthSection session={session} />

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
          <option value="">Select cable tray...</option>
          {SAMPLE_CABLE_TRAYS.map((ct) => (
            <option key={ct.id} value={ct.id}>
              {ct.name} ({ct.length_m}m, {ct.level})
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
          <option value="">Select hanger family...</option>
          {SAMPLE_HANGER_FAMILIES.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}
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
