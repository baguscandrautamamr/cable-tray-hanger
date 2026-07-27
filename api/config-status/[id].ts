import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../_lib/supabaseAdmin";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ status: "FAILED", message: "Method not allowed" });
  }

  const { id } = req.query;
  const { status, hangers_placed, sync_timestamp, synced_by } = req.body ?? {};

  if (!id || typeof id !== "string" || !status) {
    return res.status(400).json({ status: "FAILED", message: "Missing id or status" });
  }

  const { data: config, error: fetchError } = await supabaseAdmin
    .from("hanger_configs")
    .select("placement_positions")
    .eq("id", id)
    .single();

  if (fetchError || !config) {
    return res.status(404).json({ status: "FAILED", message: "Config not found" });
  }

  const { error: updateError } = await supabaseAdmin
    .from("hanger_configs")
    .update({ status, synced_at: sync_timestamp, synced_by })
    .eq("id", id);

  if (updateError) {
    return res.status(500).json({ status: "FAILED", message: updateError.message });
  }

  const { error: historyError } = await supabaseAdmin.from("hanger_placement_history").insert({
    config_id: id,
    hangers_placed,
    placement_positions: config.placement_positions,
    status: status === "SYNCED" ? "SUCCESS" : "ERROR",
    revit_sync_timestamp: sync_timestamp,
    synced_by,
  });

  if (historyError) {
    return res.status(500).json({ status: "FAILED", message: historyError.message });
  }

  return res.status(200).json({
    status: "SUCCESS",
    message: "Placement confirmed. History updated.",
  });
}
