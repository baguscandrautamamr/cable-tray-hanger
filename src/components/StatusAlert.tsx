import { AlertCircle, Bell, Check, Info } from "lucide-react";
import type { StatusAlertData } from "../types";

const STYLES: Record<StatusAlertData["kind"], { classes: string; Icon: typeof Check }> = {
  success: {
    classes: "bg-emerald-500/10 border-emerald-500/40 text-emerald-300",
    Icon: Check,
  },
  pending: {
    classes: "bg-sky-500/10 border-sky-500/40 text-sky-300",
    Icon: Bell,
  },
  failed: {
    classes: "bg-red-500/10 border-red-500/40 text-red-300",
    Icon: AlertCircle,
  },
  info: {
    classes: "bg-slate-500/10 border-slate-500/40 text-slate-300",
    Icon: Info,
  },
};

export default function StatusAlert({ kind, message }: StatusAlertData) {
  const { classes, Icon } = STYLES[kind];

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${classes}`}
      role="status"
    >
      <Icon size={18} className="shrink-0" />
      <span>{message}</span>
    </div>
  );
}
