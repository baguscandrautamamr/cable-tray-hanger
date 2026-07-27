import type { PlacementPosition } from "../types";

interface VisualizationCanvasProps {
  totalLengthM: number;
  positions: PlacementPosition[];
}

const REASON_COLOR: Record<PlacementPosition["reason"], string> = {
  START: "bg-amber-400",
  END: "bg-amber-400",
  ELBOW: "bg-emerald-400",
  SPACING: "bg-violet-400",
};

export default function VisualizationCanvas({
  totalLengthM,
  positions,
}: VisualizationCanvasProps) {
  if (totalLengthM <= 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-700 text-sm text-slate-500">
        Select a cable tray to preview placement
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-800 p-4">
      <div className="relative h-3 w-full rounded-full bg-slate-800">
        {positions.map((p, i) => (
          <div
            key={`${p.pos_m}-${i}`}
            title={`${p.reason} @ ${Math.round(p.pos_m * 1000)}mm`}
            className={`absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 -translate-x-1/2 rounded-full ring-2 ring-slate-950 ${REASON_COLOR[p.reason]}`}
            style={{ left: `${(p.pos_m / totalLengthM) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-3 flex justify-between text-xs text-slate-500">
        <span>0m</span>
        <span>{totalLengthM.toFixed(1)}m</span>
      </div>
      <p className="mt-2 text-center text-xs text-slate-600">
        Interactive visualization — coming in a future iteration
      </p>
    </div>
  );
}
