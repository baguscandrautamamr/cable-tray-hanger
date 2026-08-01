import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { resolveSupabaseAdmin } from "./supabaseAdmin.js";

/** All generated keys carry this prefix so they are recognisable in a log or a paste. */
export const API_KEY_PREFIX = "cth_";

/** Who is behind an add-in request. */
export interface AddinCaller {
  /**
   * Owner of the key. Null only for the ADDIN_API_KEY environment fallback,
   * which is not tied to an account and is therefore not scoped to one user's
   * configs.
   */
  userId: string | null;
  keyId: string | null;
  label: string;
}

export function generateApiKey(): string {
  return API_KEY_PREFIX + randomBytes(24).toString("base64url");
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** The leading fragment shown in the UI so a key can be told apart after it is hidden. */
export function apiKeyPreview(key: string): string {
  return key.slice(0, API_KEY_PREFIX.length + 6);
}

/**
 * Compare two secrets without leaking their contents through timing. Hashing
 * first keeps both buffers the same length, which timingSafeEqual requires and
 * which also hides the length of the expected key.
 */
export function secretsMatch(provided: string, expected: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(provided).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

/**
 * Machine-to-machine auth for the endpoints the Revit add-in calls. These run
 * with the Supabase service role key, which bypasses RLS, so they must never be
 * reachable without a valid key.
 *
 * Keys are generated in the web app and stored only as a SHA-256 hash, so a
 * leak of the table does not hand over working credentials.
 *
 * Returns null when unauthorised, having already written the error response.
 */
export async function requireAddinKey(
  req: VercelRequest,
  res: VercelResponse,
): Promise<AddinCaller | null> {
  const provided = req.headers["x-api-key"];

  if (typeof provided !== "string" || provided.length === 0) {
    res.status(401).json({ status: "FAILED", message: "Missing x-api-key header" });
    return null;
  }

  // Escape hatch for deployments that provision the add-in without an account
  // (a shared workstation image, a smoke test). Not scoped to a user.
  const envKey = process.env.ADDIN_API_KEY;
  if (envKey && secretsMatch(provided, envKey)) {
    return { userId: null, keyId: null, label: "ADDIN_API_KEY environment variable" };
  }

  const supabaseAdmin = resolveSupabaseAdmin(res);
  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .from("addin_api_keys")
    .select("id, user_id, label, revoked_at")
    .eq("key_hash", hashApiKey(provided))
    .maybeSingle();

  if (error) {
    res.status(500).json({ status: "FAILED", message: `Could not verify the key: ${error.message}` });
    return null;
  }

  if (!data) {
    res.status(401).json({
      status: "FAILED",
      message: "Unknown API key. Generate one in the web app under API Keys.",
    });
    return null;
  }

  if (data.revoked_at) {
    res.status(401).json({ status: "FAILED", message: `API key "${data.label}" has been revoked.` });
    return null;
  }

  // Best-effort: a failed timestamp write must not fail the request.
  void supabaseAdmin
    .from("addin_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => undefined);

  return { userId: data.user_id, keyId: data.id, label: data.label };
}

/**
 * Resolve the signed-in Supabase user from the request's bearer token. Callers
 * must attribute writes to this id rather than to anything in the request body,
 * which a client can set to any value.
 *
 * Returns null when unauthenticated, having already written the error response.
 */
export async function requireUser(
  req: VercelRequest,
  res: VercelResponse,
): Promise<{ id: string; email: string | null } | null> {
  const header = req.headers.authorization;
  const token =
    typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!token) {
    res.status(401).json({ status: "FAILED", message: "Missing Authorization bearer token" });
    return null;
  }

  const supabaseAdmin = resolveSupabaseAdmin(res);
  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ status: "FAILED", message: "Invalid or expired session" });
    return null;
  }

  return { id: data.user.id, email: data.user.email ?? null };
}
