import type { VercelRequest, VercelResponse } from "@vercel/node";
import { hashApiKey } from "./_lib/auth";
import { getSupabaseAdmin, missingServerEnv } from "./_lib/supabaseAdmin";
import { handledPreflight } from "./_lib/http";

/**
 * GET /api/health — what is and is not configured on this deployment.
 *
 * Exists because a missing environment variable used to surface as Vercel's
 * opaque "A server error has occurred", which gives nobody anything to act on.
 *
 * Unauthenticated on purpose: it is the tool you reach for when auth itself is
 * the thing that is broken. It reports only booleans — never a value, a URL or
 * a key — so there is nothing here an attacker could not learn by watching
 * which endpoints return 500.
 *
 * Send an `x-api-key` header and it additionally reports whether that key is
 * accepted, which is what the add-in's "Test connection" button uses.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handledPreflight(req, res)) return;

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ status: "FAILED", message: "Method not allowed" });
  }

  const missing = missingServerEnv();

  const env = {
    supabase_url: !missing.includes("SUPABASE_URL"),
    supabase_service_role_key: !missing.includes("SUPABASE_SERVICE_ROLE_KEY"),
    addin_api_key_fallback: Boolean(process.env.ADDIN_API_KEY),
  };

  const database = {
    reachable: false,
    hanger_configs_table: false,
    addin_api_keys_table: false,
  };

  const apiKey = {
    provided: typeof req.headers["x-api-key"] === "string",
    valid: false,
    label: null as string | null,
  };

  if (missing.length === 0) {
    try {
      const supabaseAdmin = getSupabaseAdmin();

      const configs = await supabaseAdmin
        .from("hanger_configs")
        .select("id", { count: "exact", head: true });
      database.reachable = !configs.error;
      database.hanger_configs_table = !configs.error;

      const keys = await supabaseAdmin
        .from("addin_api_keys")
        .select("id", { count: "exact", head: true });
      database.addin_api_keys_table = !keys.error;
      database.reachable ||= !keys.error;

      if (apiKey.provided && database.addin_api_keys_table) {
        const { data } = await supabaseAdmin
          .from("addin_api_keys")
          .select("label, revoked_at")
          .eq("key_hash", hashApiKey(req.headers["x-api-key"] as string))
          .maybeSingle();

        if (data && !data.revoked_at) {
          apiKey.valid = true;
          apiKey.label = data.label;
        }
      }
    } catch {
      // Leave the flags false; the response itself is the diagnosis.
    }
  }

  // The env fallback key is accepted by the add-in endpoints without touching
  // the database, so report it as valid here too.
  if (!apiKey.valid && apiKey.provided && env.addin_api_key_fallback) {
    apiKey.valid = req.headers["x-api-key"] === process.env.ADDIN_API_KEY;
    if (apiKey.valid) apiKey.label = "ADDIN_API_KEY environment variable";
  }

  const ok = missing.length === 0 && database.hanger_configs_table && database.addin_api_keys_table;

  const hints: string[] = [];
  if (missing.length > 0) {
    hints.push(
      `Set ${missing.join(" and ")} in Vercel → Settings → Environment Variables, then redeploy.`,
    );
  } else if (!database.reachable) {
    hints.push("The Supabase credentials are set but the database did not answer.");
  } else {
    if (!database.hanger_configs_table) hints.push("Run supabase/schema.sql in the Supabase SQL editor.");
    if (!database.addin_api_keys_table) {
      hints.push("Run supabase/migrations/0002-addin-api-keys.sql in the Supabase SQL editor.");
    }
  }
  if (apiKey.provided && !apiKey.valid && ok) {
    hints.push("That API key is not recognised. Generate a new one in the web app under API Keys.");
  }

  return res.status(ok ? 200 : 503).json({ ok, env, database, api_key: apiKey, hints });
}
