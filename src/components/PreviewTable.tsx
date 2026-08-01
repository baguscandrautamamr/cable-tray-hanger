import { Check, MapPin, Ruler } from "lucide-react";
import type { PlacementPosition } from "../types";

const REASON_ICON: Record<PlacementPosition["reason"], typeof Check> = {
  START: Check,
  END: Check,
  ELBOW: MapPin,
  SPACING: Ruler,
};

const REASON_COLOR: Record<PlacementPosition["reason"], string> = {
  START: "text-amber-400",
  END: "text-amber-400",
  ELBOW: "text-emerald-400",
  SPACING: "text-violet-400",
};

interface PreviewTableProps {
  positions: PlacementPosition[];
}

export default function PreviewTable({ positions }: PreviewTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full min-w-[420px] text-left text-sm">
        <thead className="bg-slate-900 text-slate-400">
          <tr>
            <th className="px-4 py-2 font-medium">Position (mm)</th>
            <th className="px-4 py-2 font-medium">Reason</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {positions.map((p, i) => {
            const Icon = REASON_ICON[p.reason];
            return (
              <tr key={`${p.pos_m}-${i}`} className="text-slate-300">
                <td className="px-4 py-2 font-mono">{Math.round(p.pos_m * 1000)}</td>
                <td className={`px-4 py-2 ${REASON_COLOR[p.reason]}`}>
                  <span className="inline-flex items-center gap-1.5">
                    <Icon size={14} />
                    {p.reason}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
