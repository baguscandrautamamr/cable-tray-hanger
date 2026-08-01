import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAddinKey } from "../_lib/auth";
import { resolveSupabaseAdmin } from "../_lib/supabaseAdmin";

/** Terminal states the add-in may report. Mirrors the CHECK in schema.sql. */
const ALLOWED_STATUSES = ["SYNCED", "FAILED"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ status: "FAILED", message: "Method not allowed" });
  }

  const caller = await requireAddinKey(req, res);
  if (!caller) return;

  const supabaseAdmin = resolveSupabaseAdmin(res);
  if (!supabaseAdmin) return;

  const { id } = req.query;
  const { status, hangers_placed, sync_timestamp, synced_by } = req.body ?? {};

  if (!id || typeof id !== "string") {
    return res.status(400).json({ status: "FAILED", message: "Missing config id" });
  }

  // An unrecognised status used to be written straight through to the
  // dashboard, which renders a per-status icon and has none to show for it.
  if (!ALLOWED_STATUSES.includes(status)) {
    return res.status(400).json({
      status: "FAILED",
      message: `status must be one of: ${ALLOWED_STATUSES.join(", ")}`,
    });
  }

  if (hangers_placed !== undefined && !Number.isInteger(hangers_placed)) {
    return res
      .status(400)
      .json({ status: "FAILED", message: "hangers_placed must be an integer" });
  }

  const { data: config, error: fetchError } = await supabaseAdmin
    .from("hanger_configs")
    .select("id, created_by")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return res.status(500).json({ status: "FAILED", message: fetchError.message });
  }

  if (!config) {
    return res.status(404).json({ status: "FAILED", message: "Config not found" });
  }

  // A key may only confirm placements for configs its owner created. Answering
  // 404 rather than 403 avoids confirming that someone else's id exists.
  if (caller.userId && config.created_by !== caller.userId) {
    return res.status(404).json({ status: "FAILED", message: "Config not found" });
  }

  // One transaction: the status update and the history row land together, so a
  // failure can't leave a config marked SYNCED with no record of the placement.
  const { error } = await supabaseAdmin.rpc("confirm_placement", {
    p_config_id: id,
    p_status: status,
    p_hangers_placed: hangers_placed ?? null,
    p_sync_timestamp: sync_timestamp ?? null,
    p_synced_by: synced_by ?? null,
  });

  if (error) {
    return res.status(500).json({ status: "FAILED", message: error.message });
  }

  return res.status(200).json({
    status: "SUCCESS",
    message: "Placement confirmed. History updated.",
  });
}
