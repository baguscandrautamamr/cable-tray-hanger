import type { VercelRequest, VercelResponse } from "@vercel/node";
import { apiKeyPreview, generateApiKey, hashApiKey, requireUser } from "./_lib/auth";
import { resolveSupabaseAdmin } from "./_lib/supabaseAdmin";
import { handledPreflight } from "./_lib/http";

const MAX_ACTIVE_KEYS = 20;

/**
 * Add-in API keys, owned by the signed-in user.
 *
 *   GET    /api/addin-keys          list this user's keys (metadata only)
 *   POST   /api/addin-keys          create one; the secret is returned ONCE
 *   DELETE /api/addin-keys?id=...   revoke one
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handledPreflight(req, res)) return;

  if (!["GET", "POST", "DELETE"].includes(req.method ?? "")) {
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ status: "FAILED", message: "Method not allowed" });
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const supabaseAdmin = resolveSupabaseAdmin(res);
  if (!supabaseAdmin) return;

  if (req.method === "GET") {
    const { data, error } = await supabaseAdmin
      .from("addin_api_keys")
      .select("id, label, key_preview, created_at, last_used_at, revoked_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ status: "FAILED", message: error.message });
    }

    return res.status(200).json({ status: "SUCCESS", keys: data ?? [] });
  }

  if (req.method === "POST") {
    const label = typeof req.body?.label === "string" ? req.body.label.trim() : "";

    if (!label) {
      return res.status(400).json({
        status: "FAILED",
        message: "A label is required — name the machine this key is for.",
      });
    }

    if (label.length > 60) {
      return res.status(400).json({ status: "FAILED", message: "Label must be 60 characters or fewer." });
    }

    const { count, error: countError } = await supabaseAdmin
      .from("addin_api_keys")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("revoked_at", null);

    if (countError) {
      return res.status(500).json({ status: "FAILED", message: countError.message });
    }

    if ((count ?? 0) >= MAX_ACTIVE_KEYS) {
      return res.status(409).json({
        status: "FAILED",
        message: `You already have ${MAX_ACTIVE_KEYS} active keys. Revoke one first.`,
      });
    }

    // Only the hash is stored. This response is the one and only time the
    // caller can read the secret.
    const key = generateApiKey();

    const { data, error } = await supabaseAdmin
      .from("addin_api_keys")
      .insert({
        user_id: user.id,
        label,
        key_preview: apiKeyPreview(key),
        key_hash: hashApiKey(key),
      })
      .select("id, label, key_preview, created_at, last_used_at, revoked_at")
      .single();

    if (error) {
      return res.status(500).json({ status: "FAILED", message: error.message });
    }

    return res.status(201).json({ status: "SUCCESS", key, record: data });
  }

  const id = typeof req.query.id === "string" ? req.query.id : "";

  if (!id) {
    return res.status(400).json({ status: "FAILED", message: "Missing key id" });
  }

  // Revoke rather than delete: the placement history references who synced
  // what, and a deleted key would make that trail harder to follow.
  const { data, error } = await supabaseAdmin
    .from("addin_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return res.status(500).json({ status: "FAILED", message: error.message });
  }

  if (!data) {
    return res.status(404).json({ status: "FAILED", message: "Key not found, or already revoked" });
  }

  return res.status(200).json({ status: "SUCCESS", message: "Key revoked." });
}
