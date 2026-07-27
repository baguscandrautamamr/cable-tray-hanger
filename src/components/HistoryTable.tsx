import { AlertCircle, Check, Clock } from "lucide-react";
import type { HangerConfig } from "../types";

interface HistoryTableProps {
  configs: HangerConfig[];
}

const STATUS_ICON: Record<HangerConfig["status"], typeof Check> = {
  SYNCED: Check,
  PENDING: Clock,
  FAILED: AlertCircle,
};

const STATUS_COLOR: Record<HangerConfig["status"], string> = {
  SYNCED: "text-emerald-400",
  PENDING: "text-sky-400",
  FAILED: "text-red-400",
};

export default function HistoryTable({ configs }: HistoryTableProps) {
  if (configs.length === 0) {
    return (
      <p className="text-sm text-slate-500">No configs yet. Push one to Revit to see it here.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-slate-900 text-slate-400">
          <tr>
            <th className="px-4 py-2 font-medium">Cable Tray</th>
            <th className="px-4 py-2 font-medium">Hanger Family</th>
            <th className="px-4 py-2 font-medium">Total Hangers</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {configs.map((c) => {
            const Icon = STATUS_ICON[c.status];
            return (
              <tr key={c.id} className="text-slate-300">
                <td className="px-4 py-2">{c.cable_tray_name}</td>
                <td className="px-4 py-2">{c.hanger_family_name}</td>
                <td className="px-4 py-2">{c.total_hangers_calculated}</td>
                <td className={`px-4 py-2 ${STATUS_COLOR[c.status]}`}>
                  <span className="inline-flex items-center gap-1.5">
                    <Icon size={14} />
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-500">
                  {new Date(c.created_at).toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
