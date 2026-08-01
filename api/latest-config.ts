import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAddinKey } from "./_lib/auth.js";
import { resolveSupabaseAdmin } from "./_lib/supabaseAdmin.js";

/** Every state a config can be in. Mirrors the CHECK in schema.sql. */
const CONFIG_STATUSES = ["PENDING", "SYNCED", "FAILED"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ status: "FAILED", message: "Method not allowed" });
  }

  const caller = await requireAddinKey(req, res);
  if (!caller) return;

  const supabaseAdmin = resolveSupabaseAdmin(res);
  if (!supabaseAdmin) return;

  const { project, status = "PENDING" } = req.query;

  if (!project || typeof project !== "string") {
    return res.status(400).json({ status: "FAILED", message: "Missing project query param" });
  }

  // A repeated query param (?status=a&status=b) arrives as an array, which
  // would reach .eq() as a non-scalar. Mirrors the CHECK in schema.sql and the
  // guard in config-status/[id].ts.
  if (typeof status !== "string" || !CONFIG_STATUSES.includes(status)) {
    return res.status(400).json({
      status: "FAILED",
      message: `status must be one of: ${CONFIG_STATUSES.join(", ")}`,
    });
  }

  let query = supabaseAdmin
    .from("hanger_configs")
    .select("*")
    .eq("project_name", project)
    .eq("status", status);

  // A key belongs to an account, so it only sees that account's configs. The
  // environment fallback has no owner and is left unscoped.
  if (caller.userId) {
    query = query.eq("created_by", caller.userId);
  }

  const { data, error } = await query
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ status: "FAILED", message: error.message });
  }

  if (!data) {
    return res.status(404).json({ status: "NOT_FOUND", message: "No pending config found" });
  }

  // `trays` is the shape a config has had since it started covering a whole
  // scan. Rows from the single-tray version are folded into the same shape so
  // the add-in only ever has one thing to read.
  const trays = data.trays ?? [
    {
      cable_tray_id: data.cable_tray_id,
      cable_tray_name: data.cable_tray_name,
      cable_tray_length_m: data.cable_tray_length_m,
      tray_width_mm: 0,
      placement_positions: data.placement_positions ?? [],
    },
  ];

  return res.status(200).json({
    config_id: data.id,
    hanger_family_name: data.hanger_family_name,
    hanger_height_mm: data.hanger_height_mm,
    trays,
    total_hangers: data.total_hangers_calculated,
  });
}
