import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_lib/supabaseAdmin";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ status: "FAILED", message: "Method not allowed" });
  }

  const { project, status = "PENDING" } = req.query;

  if (!project || typeof project !== "string") {
    return res.status(400).json({ status: "FAILED", message: "Missing project query param" });
  }

  const { data, error } = await supabaseAdmin
    .from("hanger_configs")
    .select("*")
    .eq("project_name", project)
    .eq("status", status)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ status: "FAILED", message: error.message });
  }

  if (!data) {
    return res.status(404).json({ status: "NOT_FOUND", message: "No pending config found" });
  }

  return res.status(200).json({
    config_id: data.id,
    cable_tray_id: data.cable_tray_id,
    cable_tray_name: data.cable_tray_name,
    hanger_family_name: data.hanger_family_name,
    placement_positions: data.placement_positions,
    total_hangers: data.total_hangers_calculated,
  });
}
