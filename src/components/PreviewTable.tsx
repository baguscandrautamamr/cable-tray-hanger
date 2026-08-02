import { Check, MapPin, Ruler } from "lucide-react";
import type { PlacementPosition } from "../types";
import { useTranslation } from "../i18n/useTranslation";
import { tableBody, tableHead, tableRow, tableWrap } from "../ui/styles";

const REASON_ICON: Record<PlacementPosition["reason"], typeof Check> = {
  START: Check,
  END: Check,
  ELBOW: MapPin,
  SPACING: Ruler,
};

const REASON_COLOR: Record<PlacementPosition["reason"], string> = {
  START: "text-amber-600 dark:text-amber-400",
  END: "text-amber-600 dark:text-amber-400",
  ELBOW: "text-emerald-600 dark:text-emerald-400",
  SPACING: "text-violet-600 dark:text-violet-400",
};

interface PreviewTableProps {
  positions: PlacementPosition[];
}

export default function PreviewTable({ positions }: PreviewTableProps) {
  const { t } = useTranslation();

  return (
    <div className={tableWrap}>
      <table className="w-full min-w-[420px] text-left text-sm">
        <thead className={tableHead}>
          <tr>
            <th className="px-4 py-2 font-medium">{t("config.preview.position")}</th>
            <th className="px-4 py-2 font-medium">{t("config.preview.reason")}</th>
          </tr>
        </thead>
        <tbody className={tableBody}>
          {positions.map((p, i) => {
            const Icon = REASON_ICON[p.reason];
            return (
              <tr key={`${p.pos_m}-${i}`} className={tableRow}>
                <td className="px-4 py-2 font-mono">{Math.round(p.pos_m * 1000)}</td>
                <td className={`px-4 py-2 ${REASON_COLOR[p.reason]}`}>
                  <span className="inline-flex items-center gap-1.5">
                    <Icon size={14} />
                    {t(`config.reason.${p.reason}`)}
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
