import { Ban, Check, Copy, KeyRound, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AddinApiKey, StatusAlertData } from "../types";
import { createAddinKey, listAddinKeys, revokeAddinKey } from "../services/apiClient";
import { useTranslation } from "../i18n/useTranslation";
import PageHeader from "../components/PageHeader";
import StatusAlert from "../components/StatusAlert";
import {
  faint,
  input,
  muted,
  primaryButton,
  surface,
  tableBody,
  tableHead,
  tableRow,
  tableWrap,
} from "../ui/styles";

interface ApiKeysProps {
  session: Session;
}

export default function ApiKeys({ session }: ApiKeysProps) {
  const { t } = useTranslation();

  const [keys, setKeys] = useState<AddinApiKey[]>([]);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [alert, setAlert] = useState<StatusAlertData | null>(null);

  // Held in memory only, and only until the user navigates away: the server
  // cannot show this value again.
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const describe = useCallback(
    (err: unknown) => (err instanceof Error ? err.message : t("keys.unknownError")),
    [t],
  );

  const formatDate = useCallback(
    (value: string | null) => (value ? new Date(value).toLocaleString() : t("common.none")),
    [t],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { keys: loaded } = await listAddinKeys();
      setKeys(loaded);
    } catch (err) {
      setAlert({ kind: "failed", message: describe(err) });
    } finally {
      setLoading(false);
    }
  }, [describe]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;

    setCreating(true);
    setAlert(null);
    try {
      const created = await createAddinKey(label.trim());
      setFreshKey(created.key);
      setCopied(false);
      setLabel("");
      await refresh();
    } catch (err) {
      setAlert({ kind: "failed", message: describe(err) });
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(key: AddinApiKey) {
    if (!window.confirm(t("keys.revokeConfirm", { label: key.label }))) {
      return;
    }
    try {
      await revokeAddinKey(key.id);
      setAlert({ kind: "info", message: t("keys.revokedNotice", { label: key.label }) });
      await refresh();
    } catch (err) {
      setAlert({ kind: "failed", message: describe(err) });
    }
  }

  async function handleCopy() {
    if (!freshKey) return;
    try {
      await navigator.clipboard.writeText(freshKey);
      setCopied(true);
    } catch {
      // Clipboard access can be refused; the key is on screen to copy by hand.
      setAlert({ kind: "info", message: t("keys.clipboardFailed") });
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <PageHeader
        session={session}
        backTo="/"
        title={t("keys.title")}
        subtitle={t("keys.subtitle")}
      />

      {freshKey && (
        <section className="flex flex-col gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
            <KeyRound size={18} />
            {t("keys.freshTitle")}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
              {freshKey}
            </code>
            <button onClick={handleCopy} className={primaryButton}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? t("keys.copied") : t("keys.copy")}
            </button>
          </div>
          <p className="text-xs text-amber-900/80 dark:text-amber-200/80">{t("keys.freshNote")}</p>
          <button
            onClick={() => setFreshKey(null)}
            className="self-start text-xs text-amber-800/80 underline hover:text-amber-900 dark:text-amber-200/70 dark:hover:text-amber-100"
          >
            {t("keys.freshHide")}
          </button>
        </section>
      )}

      <form onSubmit={handleCreate} className={`flex flex-wrap items-end gap-3 p-4 ${surface}`}>
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="key-label" className="text-sm font-medium">
            {t("keys.new")}
          </label>
          <input
            id="key-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={60}
            required
            placeholder={t("keys.labelPlaceholder")}
            className={`w-full ${input}`}
          />
        </div>
        <button type="submit" disabled={creating || !label.trim()} className={primaryButton}>
          <Plus size={18} />
          {creating ? t("keys.generating") : t("keys.generate")}
        </button>
      </form>

      {alert && <StatusAlert kind={alert.kind} message={alert.message} />}

      {loading ? (
        <p className={`text-sm ${muted}`}>{t("common.loading")}</p>
      ) : keys.length === 0 ? (
        <p className={`text-sm ${muted}`}>{t("keys.empty")}</p>
      ) : (
        <div className={tableWrap}>
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className={tableHead}>
              <tr>
                <th className="px-4 py-2 font-medium">{t("keys.label")}</th>
                <th className="px-4 py-2 font-medium">{t("keys.key")}</th>
                <th className="px-4 py-2 font-medium">{t("keys.created")}</th>
                <th className="px-4 py-2 font-medium">{t("keys.lastUsed")}</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className={tableBody}>
              {keys.map((key) => (
                <tr
                  key={key.id}
                  className={key.revoked_at ? "text-slate-400 dark:text-slate-600" : tableRow}
                >
                  <td className="px-4 py-2">
                    {key.label}
                    {key.revoked_at && (
                      <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        {t("keys.revoked")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{key.key_preview}…</td>
                  <td className={`px-4 py-2 ${faint}`}>{formatDate(key.created_at)}</td>
                  <td className={`px-4 py-2 ${faint}`}>{formatDate(key.last_used_at)}</td>
                  <td className="px-4 py-2 text-right">
                    {!key.revoked_at && (
                      <button
                        onClick={() => handleRevoke(key)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:border-red-500/60 hover:text-red-600 dark:border-slate-700 dark:text-slate-300 dark:hover:text-red-400"
                      >
                        <Ban size={14} />
                        {t("keys.revoke")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
