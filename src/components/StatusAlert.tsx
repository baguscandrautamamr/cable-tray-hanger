import { AlertCircle, Bell, Check, Info } from "lucide-react";
import type { ReactNode } from "react";
import type { AlertKind, StatusAlertData } from "../types";

// Light needs the darker end of each ramp and dark needs the lighter end: a
// tint at 10% opacity is nearly white on one background and nearly black on the
// other, so only the border and the surrounding page carry the colour.
const STYLES: Record<AlertKind, { classes: string; Icon: typeof Check }> = {
  success: {
    classes: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
    Icon: Check,
  },
  pending: {
    classes: "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-300",
    Icon: Bell,
  },
  failed: {
    classes: "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-300",
    Icon: AlertCircle,
  },
  info: {
    classes: "border-slate-400/50 bg-slate-500/10 text-slate-700 dark:text-slate-300",
    Icon: Info,
  },
};

interface StatusAlertProps extends StatusAlertData {
  /**
   * Detail under the message — the trays an explanation is about, say. Kept
   * separate so the message itself stays one readable sentence.
   */
  children?: ReactNode;
}

export default function StatusAlert({ kind, message, children }: StatusAlertProps) {
  const { classes, Icon } = STYLES[kind];

  return (
    <div className={`flex gap-2 rounded-lg border px-4 py-3 text-sm ${classes}`} role="status">
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <span>{message}</span>
        {children}
      </div>
    </div>
  );
}
