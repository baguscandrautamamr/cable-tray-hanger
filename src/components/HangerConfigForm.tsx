import { ArrowUpDown, Cable, Check, Plus, Ruler, Send, Wrench, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { CableTray, PlacementPosition, ScanRecord, StatusAlertData } from "../types";
import {
  MIN_SPACING_MM,
  calculatePlacements,
  summarizePlacements,
} from "../services/placementAlgorithm";
import { fetchLatestScan, submitHangerConfig } from "../services/apiClient";
import { useTranslation } from "../i18n/useTranslation";
import PreviewTable from "./PreviewTable";
import StatusAlert from "./StatusAlert";
import VisualizationCanvas from "./VisualizationCanvas";
import {
  accentIcon,
  actionButton,
  faint,
  input,
  label as labelClass,
  muted,
  secondaryButton,
  surface,
  tableBody,
  tableHead,
  tableRow,
  tableWrap,
} from "../ui/styles";

const DEFAULT_HEIGHT_MM = 500;
const DEFAULT_SPACING_MM = 1500;

interface HangerConfigFormProps {
  session: Session;

  /** Reports the scanned project name upwards, so the page header can show it. */
  onProjectName?: (projectName: string) => void;
  onSaved?: () => void;
}

/** A tray with its placement worked out, mirroring what the server will store. */
interface PlannedTray {
  tray: CableTray;
  positions: PlacementPosition[];
}

/** Hangers already on a tray, as the model reported them at scan time. */
const existingCount = (tray: CableTray) => tray.existing_hanger_count ?? 0;

/**
 * A tray this config will not touch, and why. Both reasons leave the tray
 * exactly as it is, so they are two lists rather than one flag.
 */
const isSkipped = (tray: CableTray) => existingCount(tray) > 0 || tray.is_vertical === true;

export default function HangerConfigForm({
  session,
  onProjectName,
  onSaved,
}: HangerConfigFormProps) {
  const { t } = useTranslation();

  const [scan, setScan] = useState<ScanRecord | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [hangerFamilyName, setHangerFamilyName] = useState("");
  const [spacingMm, setSpacingMm] = useState(DEFAULT_SPACING_MM);
  const [heightMm, setHeightMm] = useState(DEFAULT_HEIGHT_MM);
  const [alert, setAlert] = useState<StatusAlertData | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The trays and families come from the model, not from this file.
  useEffect(() => {
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
        setScanError(err instanceof Error ? err.message : t("keys.unknownError"));
      })
      .finally(() => {
        if (!cancelled) setScanLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session, onProjectName, t]);

  const hangerFamilies = useMemo(() => scan?.hanger_families ?? [], [scan]);

  // A cleared or out-of-range spacing would make calculatePlacements throw
  // during render, so hold the preview empty until the value is usable.
  const spacingValid = Number.isFinite(spacingMm) && spacingMm >= MIN_SPACING_MM;
  const heightValid = Number.isFinite(heightMm) && heightMm > 0;

  // Trays that already carry hangers keep whatever height they were revised to
  // in Revit, so they are reported and then left alone — not topped up and not
  // re-spaced. Adding to a run means placing beside hangers somebody has
  // already positioned, and there is no way to do that without risking the work.
  const skippedTrays = useMemo(
    () => (scan?.cable_trays ?? []).filter((tray) => existingCount(tray) > 0),
    [scan],
  );

  // A riser is not held up from above by anything, so a hanger spaced along one
  // stands in mid-air beside the tray. The add-in works this out from the run's
  // own geometry; nothing here has to be told which ones they are.
  const verticalTrays = useMemo(
    () => (scan?.cable_trays ?? []).filter((tray) => tray.is_vertical),
    [scan],
  );

  // Every *empty* tray is planned — there is nothing to pick. Selecting runs
  // one at a time was the slow part of the job.
  const plannedTrays = useMemo<PlannedTray[]>(() => {
    if (!scan || !spacingValid) return [];

    return scan.cable_trays.flatMap((tray) => {
      if (isSkipped(tray)) return [];

      try {
        return [{ tray, positions: calculatePlacements(tray.length_m, spacingMm) }];
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
    if (!scan || !hangerFamilyName || !spacingValid || !heightValid) return;

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
        message: t("config.pushError", {
          message: err instanceof Error ? err.message : t("keys.unknownError"),
        }),
      });
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    setHangerFamilyName("");
    setSpacingMm(DEFAULT_SPACING_MM);
    setHeightMm(DEFAULT_HEIGHT_MM);
    setAlert(null);
  }

  const canPush = Boolean(
    plannedTrays.length > 0 && hangerFamilyName && spacingValid && heightValid && !submitting,
  );

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Where the model data came from, and what is wrong with it */}
      {scanLoading && <p className={`text-sm ${muted}`}>{t("config.loadingScan")}</p>}

      {scanError && (
        <StatusAlert kind="failed" message={t("config.scanError", { message: scanError })} />
      )}

      {!scanLoading && !scanError && !scan && (
        <StatusAlert kind="info" message={t("config.noScan")} />
      )}

      {scan && (
        <p className={`text-xs ${faint}`}>
          {t("config.scanSummary", {
            view: scan.view_name || t("dash.unnamedView"),
            project: scan.project_name,
            trays: scan.cable_trays.length,
            elbows: scan.elbows.length,
            families: scan.hanger_families.length,
          })}
        </p>
      )}

      {scan && scan.hanger_families.length === 0 && (
        <StatusAlert kind="pending" message={t("config.noFamilies")} />
      )}

      {/* The keyword matched nothing, so the list below is every cable tray
          fitting rather than a narrowed one. Saying so beats an empty dropdown. */}
      {scan && scan.hanger_families_matched_keyword === false && scan.hanger_families.length > 0 && (
        <StatusAlert
          kind="pending"
          message={t("config.keywordMissed", {
            keyword: scan.hanger_family_keyword ?? "",
            count: scan.hanger_families.length,
          })}
        />
      )}

      {/* 2. The trays this config deliberately does not touch */}
      {skippedTrays.length > 0 && (
        <StatusAlert
          kind="info"
          message={t("config.skipped.title", {
            skipped: skippedTrays.length,
            total: scan?.cable_trays.length ?? skippedTrays.length,
          })}
        >
          <p>{t("config.skipped.body")}</p>
          <ul className="list-inside list-disc">
            {skippedTrays.map((tray) => (
              <li key={tray.id}>
                {tray.existing_hanger_height_mm
                  ? t("config.skipped.itemAtHeight", {
                      name: tray.name,
                      count: existingCount(tray),
                      height: Math.round(tray.existing_hanger_height_mm),
                    })
                  : t("config.skipped.item", { name: tray.name, count: existingCount(tray) })}
              </li>
            ))}
          </ul>
        </StatusAlert>
      )}

      {verticalTrays.length > 0 && (
        <StatusAlert
          kind="info"
          message={t("config.vertical.title", {
            vertical: verticalTrays.length,
            total: scan?.cable_trays.length ?? verticalTrays.length,
          })}
        >
          <p>{t("config.vertical.body")}</p>
          <ul className="list-inside list-disc">
            {verticalTrays.map((tray) => (
              <li key={tray.id}>{tray.name}</li>
            ))}
          </ul>
        </StatusAlert>
      )}

      {/* 3. Cable trays in this config — every empty one, no picking */}
      <Section
        icon={<Cable size={22} className={accentIcon} />}
        title={t("config.trays", { count: plannedTrays.length })}
      >
        <div className={tableWrap}>
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className={tableHead}>
              <tr>
                <th className="px-4 py-2 font-medium">{t("config.trays.tray")}</th>
                <th className="px-4 py-2 font-medium">{t("config.trays.length")}</th>
                <th className="px-4 py-2 font-medium">{t("config.trays.width")}</th>
                <th className="px-4 py-2 font-medium">{t("config.trays.hangers")}</th>
              </tr>
            </thead>
            <tbody className={tableBody}>
              {plannedTrays.map(({ tray, positions }) => (
                <tr key={tray.id} className={tableRow}>
                  <td className="px-4 py-2">{tray.name}</td>
                  <td className={`px-4 py-2 ${muted}`}>{tray.length_m.toFixed(2)}m</td>
                  {/* Width is not an input: the hanger has to span the tray. */}
                  <td className={`px-4 py-2 ${muted}`}>
                    {tray.width_mm ? `${Math.round(tray.width_mm)}mm` : t("common.none")}
                  </td>
                  <td className="px-4 py-2">{positions.length}</td>
                </tr>
              ))}
              {plannedTrays.length === 0 && (
                <tr>
                  <td className={`px-4 py-3 ${muted}`} colSpan={4}>
                    {t("config.trays.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className={`text-xs ${faint}`}>{t("config.trays.note")}</p>
      </Section>

      {/* 4. Hanger family selection */}
      <Section
        icon={<Wrench size={22} className={accentIcon} />}
        title={t("config.family")}
      >
        <select
          value={hangerFamilyName}
          onChange={(e) => setHangerFamilyName(e.target.value)}
          className={input}
        >
          <option value="">
            {hangerFamilies.length ? t("config.family.placeholder") : t("config.family.none")}
          </option>
          {hangerFamilies.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}
              {f.category ? ` — ${f.category}` : ""} (
              {f.type_count === 1
                ? t("config.family.type", { count: f.type_count })
                : t("config.family.types", { count: f.type_count })}
              )
            </option>
          ))}
        </select>
        <p className={`text-xs ${faint}`}>{t("config.family.note")}</p>
      </Section>

      {/* 5. Hanger spacing */}
      <Section icon={<Ruler size={22} className={accentIcon} />} title={t("config.spacing")}>
        <input
          type="number"
          min={MIN_SPACING_MM}
          max={3000}
          step={100}
          value={spacingMm}
          onChange={(e) => setSpacingMm(Number(e.target.value))}
          className={`w-40 ${input}`}
        />
        {spacingValid ? (
          <p className={`text-xs ${faint}`}>{t("config.spacing.note")}</p>
        ) : (
          <p className="text-xs text-red-600 dark:text-red-400">
            {t("config.spacing.invalid", { min: MIN_SPACING_MM })}
          </p>
        )}
      </Section>

      {/* 6. Hanger height — the one dimension the model cannot supply */}
      <Section icon={<ArrowUpDown size={22} className={accentIcon} />} title={t("config.height")}>
        <input
          type="number"
          min={1}
          step={50}
          value={heightMm}
          onChange={(e) => setHeightMm(Number(e.target.value))}
          className={`w-40 ${input}`}
        />
        {heightValid ? (
          <p className={`text-xs ${faint}`}>{t("config.height.note")}</p>
        ) : (
          <p className="text-xs text-red-600 dark:text-red-400">{t("config.height.invalid")}</p>
        )}
      </Section>

      {/* 7. Placement preview stats */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Plus size={18} className={accentIcon} />}
          label={t("config.stats.total")}
          value={stats.total}
        />
        <StatCard
          icon={<Ruler size={18} className="text-violet-600 dark:text-violet-400" />}
          label={t("config.stats.spacing")}
          value={stats.atSpacing}
        />
        <StatCard
          icon={<Check size={18} className="text-amber-600 dark:text-amber-400" />}
          label={t("config.stats.ends")}
          value={stats.startEnd}
        />
      </section>

      {/* 8. Per-tray detail and visualization */}
      {plannedTrays.map(({ tray, positions }) => (
        <section key={tray.id} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">
            {tray.name}{" "}
            <span className={`font-normal ${faint}`}>
              —{" "}
              {t("config.trayDetail", {
                count: positions.length,
                length: tray.length_m.toFixed(2),
              })}
            </span>
          </h3>
          <PreviewTable positions={positions} />
          <VisualizationCanvas totalLengthM={tray.length_m} positions={positions} />
        </section>
      ))}

      {/* 9. Action buttons */}
      <section className="flex gap-3">
        <button onClick={handlePush} disabled={!canPush} className={actionButton}>
          <Send size={18} />
          {submitting ? t("config.pushing") : t("config.push", { count: stats.total })}
        </button>
        <button onClick={handleCancel} className={secondaryButton}>
          <X size={18} />
          {t("common.cancel")}
        </button>
      </section>

      {alert && <StatusAlert kind={alert.kind} message={alert.message} />}
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <span className={labelClass}>
        {icon}
        {title}
      </span>
      {children}
    </section>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className={`flex flex-col gap-1 p-3 ${surface}`}>
      <div className={`flex items-center gap-1.5 text-xs ${muted}`}>
        {icon}
        {label}
      </div>
      <span className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</span>
    </div>
  );
}
