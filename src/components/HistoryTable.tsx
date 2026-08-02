import { AlertCircle, Check, Clock, HelpCircle } from "lucide-react";
import type { HangerConfig } from "../types";
import { useTranslation } from "../i18n/useTranslation";
import { faint, muted, tableBody, tableHead, tableRow, tableWrap } from "../ui/styles";

interface HistoryTableProps {
  configs: HangerConfig[];
}

const STATUS_ICON: Record<HangerConfig["status"], typeof Check> = {
  SYNCED: Check,
  PENDING: Clock,
  FAILED: AlertCircle,
};

const STATUS_COLOR: Record<HangerConfig["status"], string> = {
  SYNCED: "text-emerald-600 dark:text-emerald-400",
  PENDING: "text-sky-600 dark:text-sky-400",
  FAILED: "text-red-600 dark:text-red-400",
};

// A status outside the union renders as `undefined`, which React throws on.
// The API and a CHECK constraint both reject those now, but a row written
// before either was in place shouldn't take the whole dashboard down.
const UNKNOWN_STATUS = { Icon: HelpCircle, color: "text-slate-500 dark:text-slate-400" };

export default function HistoryTable({ configs }: HistoryTableProps) {
  const { t } = useTranslation();

  if (configs.length === 0) {
    return <p className={`text-sm ${muted}`}>{t("dash.empty")}</p>;
  }

  return (
    <div className={tableWrap}>
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead className={tableHead}>
          <tr>
            <th className="px-4 py-2 font-medium">{t("history.trays")}</th>
            <th className="px-4 py-2 font-medium">{t("history.family")}</th>
            <th className="px-4 py-2 font-medium">{t("history.height")}</th>
            <th className="px-4 py-2 font-medium">{t("history.total")}</th>
            <th className="px-4 py-2 font-medium">{t("history.status")}</th>
            <th className="px-4 py-2 font-medium">{t("history.created")}</th>
          </tr>
        </thead>
        <tbody className={tableBody}>
          {configs.map((c) => {
            const Icon = STATUS_ICON[c.status] ?? UNKNOWN_STATUS.Icon;
            const color = STATUS_COLOR[c.status] ?? UNKNOWN_STATUS.color;
            return (
              <tr key={c.id} className={tableRow}>
                <td className="px-4 py-2">{describeTrays(c, t)}</td>
                <td className="px-4 py-2">{c.hanger_family_name}</td>
                <td className="px-4 py-2">
                  {c.hanger_height_mm ? `${c.hanger_height_mm}mm` : t("common.none")}
                </td>
                <td className="px-4 py-2">{c.total_hangers_calculated}</td>
                <td className={`px-4 py-2 ${color}`}>
                  <span className="inline-flex items-center gap-1.5">
                    <Icon size={14} />
                    {/* Falls back to the raw value for a status the union does
                        not cover, which is the one case worth seeing verbatim. */}
                    {STATUS_ICON[c.status] ? t(`history.status.${c.status}`) : c.status}
                  </span>
                </td>
                <td className={`px-4 py-2 ${faint}`}>{new Date(c.created_at).toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A config now covers every tray in a scan, so name one and count the rest.
 * `cable_tray_name` is only populated on rows from the single-tray version.
 */
function describeTrays(
  config: HangerConfig,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const trays = config.trays ?? [];

  if (trays.length === 0) {
    return config.cable_tray_name ?? t("common.none");
  }

  if (trays.length === 1) {
    return trays[0].cable_tray_name;
  }

  return t("history.more", { name: trays[0].cable_tray_name, count: trays.length - 1 });
}
