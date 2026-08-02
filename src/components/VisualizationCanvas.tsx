import type { PlacementPosition } from "../types";
import { useTranslation } from "../i18n/useTranslation";
import { faint } from "../ui/styles";

interface VisualizationCanvasProps {
  totalLengthM: number;
  positions: PlacementPosition[];
}

const REASON_COLOR: Record<PlacementPosition["reason"], string> = {
  START: "bg-amber-500",
  END: "bg-amber-500",
  ELBOW: "bg-emerald-500",
  SPACING: "bg-violet-500",
};

export default function VisualizationCanvas({
  totalLengthM,
  positions,
}: VisualizationCanvasProps) {
  const { t } = useTranslation();

  if (totalLengthM <= 0) {
    return (
      <div
        className={`flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm dark:border-slate-700 ${faint}`}
      >
        {t("config.viz.placeholder")}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <div className="relative h-3 w-full rounded-full bg-slate-200 dark:bg-slate-800">
        {positions.map((p, i) => (
          <div
            key={`${p.pos_m}-${i}`}
            title={`${t(`config.reason.${p.reason}`)} @ ${Math.round(p.pos_m * 1000)}mm`}
            // The ring separates two markers that overlap, so it has to be the
            // page colour rather than a fixed one — on white, a slate-950 ring
            // reads as a black dot with a black outline.
            className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white dark:ring-slate-950 ${REASON_COLOR[p.reason]}`}
            style={{ left: `${(p.pos_m / totalLengthM) * 100}%` }}
          />
        ))}
      </div>
      <div className={`mt-3 flex justify-between text-xs ${faint}`}>
        <span>0m</span>
        <span>{totalLengthM.toFixed(1)}m</span>
      </div>
    </div>
  );
}
