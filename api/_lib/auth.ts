import { createHash, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./supabaseAdmin";

const addinApiKey = process.env.ADDIN_API_KEY;

/**
 * Compare two secrets without leaking their contents through timing. Hashing
 * first keeps both buffers the same length, which timingSafeEqual requires and
 * which also hides the length of the expected key.
 */
function secretsMatch(provided: string, expected: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(provided).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

/**
 * Machine-to-machine auth for the endpoints the Revit add-in calls. These run
 * with the Supabase service role key, which bypasses RLS, so they must never be
 * reachable without the shared secret.
 *
 * Returns true when the caller is authorised; otherwise it has already written
 * the error response and the handler should return immediately.
 */
export function requireAddinKey(req: VercelRequest, res: VercelResponse): boolean {
  if (!addinApiKey) {
    res.status(500).json({
      status: "FAILED",
      message: "Server misconfigured: ADDIN_API_KEY is not set",
    });
    return false;
  }

  const provided = req.headers["x-api-key"];

  if (typeof provided !== "string" || !secretsMatch(provided, addinApiKey)) {
    res.status(401).json({ status: "FAILED", message: "Invalid or missing x-api-key" });
    return false;
  }

  return true;
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
): Promise<{ id: string } | null> {
  const header = req.headers.authorization;
  const token =
    typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!token) {
    res.status(401).json({ status: "FAILED", message: "Missing Authorization bearer token" });
    return null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ status: "FAILED", message: "Invalid or expired session" });
    return null;
  }

  return { id: data.user.id };
}
