import { Eye, EyeOff, Info, LogIn } from "lucide-react";
import { useState } from "react";
import { supabase } from "../services/supabaseClient";
import { useTranslation } from "../i18n/useTranslation";
import PreferenceToggles from "../components/PreferenceToggles";
import StatusAlert from "../components/StatusAlert";
import { heading, input, muted, primaryButton, surface } from "../ui/styles";

/**
 * The gate. Nothing else in the app renders until this succeeds.
 *
 * Sign-in only, by design: there is no sign-up form, no magic link and no
 * password reset, because accounts are created by an administrator in the
 * Supabase dashboard under Authentication → Users. Saying so on the form is
 * the difference between "I do not have an account yet" and hunting for a
 * register link that was never there.
 */
export default function Login() {
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    // Supabase answers a wrong password and an unknown email with the same
    // message on purpose, and passing it through keeps it that way.
    if (signInError) setError(t("login.failed", { message: signInError.message }));
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className={`text-2xl font-semibold ${heading}`}>{t("app.title")}</h1>
            <p className={`text-sm ${muted}`}>{t("login.subtitle")}</p>
          </div>
          <PreferenceToggles />
        </div>

        <form onSubmit={handleSubmit} className={`flex flex-col gap-3 p-4 ${surface}`}>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("common.email")}</span>
            <input
              type="email"
              required
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={input}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("common.password")}</span>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full pr-9 ${input}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                title={showPassword ? t("common.hidePassword") : t("common.showPassword")}
                aria-label={showPassword ? t("common.hidePassword") : t("common.showPassword")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          {error && <StatusAlert kind="failed" message={error} />}

          <button type="submit" disabled={loading} className={primaryButton}>
            <LogIn size={18} />
            {loading ? t("login.submitting") : t("login.submit")}
          </button>
        </form>

        <p className={`flex gap-2 text-xs ${muted}`}>
          <Info size={16} className="mt-px shrink-0" />
          <span>{t("login.adminOnly")}</span>
        </p>
      </div>
    </div>
  );
}
