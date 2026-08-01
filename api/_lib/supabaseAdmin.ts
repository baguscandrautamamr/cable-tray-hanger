import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { VercelResponse } from "@vercel/node";

/** Thrown when a required server-side environment variable is absent. */
export class ConfigurationError extends Error {}

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

let cached: SupabaseClient | null = null;

/** Names of the required server variables that are not set. */
export function missingServerEnv(): string[] {
  return REQUIRED_ENV.filter((name) => !process.env[name]);
}

/**
 * Build the service-role client on first use.
 *
 * Deliberately *not* done at module scope: throwing during import makes the
 * whole function fail to load, and Vercel replaces the response with a generic
 * `{"error":{"code":"500","message":"A server error has occurred"}}` that says
 * nothing about the cause. Failing here instead lets the handler report which
 * variable is missing.
 */
export function getSupabaseAdmin(): SupabaseClient {
  const missing = missingServerEnv();

  if (missing.length > 0) {
    throw new ConfigurationError(missing.join(", "));
  }

  cached ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  return cached;
}

/**
 * Handler-friendly wrapper: returns the client, or null after writing an
 * actionable error response.
 */
export function resolveSupabaseAdmin(res: VercelResponse): SupabaseClient | null {
  try {
    return getSupabaseAdmin();
  } catch (err) {
    if (err instanceof ConfigurationError) {
      res.status(500).json({
        status: "FAILED",
        message:
          `Server misconfigured: ${err.message} not set. Add it in Vercel under ` +
          "Settings → Environment Variables, then redeploy. See GET /api/health.",
      });
      return null;
    }

    res.status(500).json({
      status: "FAILED",
      message: err instanceof Error ? err.message : "Could not reach the database",
    });
    return null;
  }
}
