import { ArrowLeft, Ban, Check, Copy, KeyRound, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import type { AddinApiKey, StatusAlertData } from "../types";
import { createAddinKey, listAddinKeys, revokeAddinKey } from "../services/apiClient";
import AuthSection from "../components/AuthSection";
import StatusAlert from "../components/StatusAlert";

interface ApiKeysProps {
  session: Session | null;
}

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleString() : "—";

export default function ApiKeys({ session }: ApiKeysProps) {
  const [keys, setKeys] = useState<AddinApiKey[]>([]);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [alert, setAlert] = useState<StatusAlertData | null>(null);

  // Held in memory only, and only until the user navigates away: the server
  // cannot show this value again.
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    if (!session) {
      setKeys([]);
      return;
    }
    setLoading(true);
    try {
      const { keys: loaded } = await listAddinKeys();
      setKeys(loaded);
    } catch (err) {
      setAlert({ kind: "failed", message: describe(err) });
    } finally {
      setLoading(false);
    }
  }, [session]);

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
    if (!window.confirm(`Revoke "${key.label}"? Any Revit add-in using it stops working.`)) {
      return;
    }
    try {
      await revokeAddinKey(key.id);
      setAlert({ kind: "info", message: `Revoked "${key.label}".` });
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
      setAlert({ kind: "info", message: "Could not reach the clipboard — select the key and copy it." });
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <header className="flex items-center gap-3">
        <Link to="/" className="text-slate-500 hover:text-slate-300">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">API Keys</h1>
          <p className="text-sm text-slate-500">
            For the Revit add-in. Paste one into its Settings dialog.
          </p>
        </div>
      </header>

      <AuthSection session={session} />

      {!session ? (
        <p className="text-sm text-slate-500">Login to manage your add-in keys.</p>
      ) : (
        <>
          {freshKey && (
            <section className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-300">
                <KeyRound size={18} />
                Copy this key now — it will not be shown again
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100">
                  {freshKey}
                </code>
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-xs text-amber-200/80">
                In Revit: <strong>Cable Tray Hanger → Settings</strong>, paste into API key, then
                Save. Only the hash is stored here, so we cannot recover it for you.
              </p>
              <button
                onClick={() => setFreshKey(null)}
                className="self-start text-xs text-amber-200/70 underline hover:text-amber-100"
              >
                I've saved it — hide
              </button>
            </section>
          )}

          <form
            onSubmit={handleCreate}
            className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-4"
          >
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="key-label" className="text-sm font-medium text-slate-200">
                New key
              </label>
              <input
                id="key-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={60}
                required
                placeholder="Which machine is this for? e.g. Workstation BIM 02"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-400"
              />
            </div>
            <button
              type="submit"
              disabled={creating || !label.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={18} />
              {creating ? "Generating..." : "Generate"}
            </button>
          </form>

          {alert && <StatusAlert kind={alert.kind} message={alert.message} />}

          {loading ? (
            <p className="text-sm text-slate-500">Loading...</p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-slate-500">
              No keys yet. Generate one above, then paste it into the add-in.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-900 text-slate-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">Label</th>
                    <th className="px-4 py-2 font-medium">Key</th>
                    <th className="px-4 py-2 font-medium">Created</th>
                    <th className="px-4 py-2 font-medium">Last used</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {keys.map((key) => (
                    <tr
                      key={key.id}
                      className={key.revoked_at ? "text-slate-600" : "text-slate-300"}
                    >
                      <td className="px-4 py-2">
                        {key.label}
                        {key.revoked_at && (
                          <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-400">
                            revoked
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{key.key_preview}…</td>
                      <td className="px-4 py-2 text-slate-500">{formatDate(key.created_at)}</td>
                      <td className="px-4 py-2 text-slate-500">{formatDate(key.last_used_at)}</td>
                      <td className="px-4 py-2 text-right">
                        {!key.revoked_at && (
                          <button
                            onClick={() => handleRevoke(key)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:border-red-500/50 hover:text-red-400"
                          >
                            <Ban size={14} />
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}
