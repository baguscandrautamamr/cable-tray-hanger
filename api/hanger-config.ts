import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { HangerConfigInput } from "../src/types";
import { calculatePlacements } from "../src/services/placementAlgorithm";
import { supabaseAdmin } from "./_lib/supabaseAdmin";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ status: "FAILED", message: "Method not allowed" });
  }

  const input = req.body as HangerConfigInput;

  if (
    !input?.cable_tray_id ||
    !input?.hanger_family_name ||
    !input?.cable_tray_length_m ||
    !input?.spacing_mm
  ) {
    return res.status(400).json({ status: "FAILED", message: "Missing required fields" });
  }

  const placementPositions = calculatePlacements(
    input.cable_tray_length_m,
    input.spacing_mm,
    input.elbows ?? [],
  );

  const { data, error } = await supabaseAdmin
    .from("hanger_configs")
    .insert({
      project_name: input.project_name,
      cable_tray_id: String(input.cable_tray_id),
      cable_tray_name: input.cable_tray_name,
      cable_tray_length_m: input.cable_tray_length_m,
      hanger_family_name: input.hanger_family_name,
      spacing_mm: input.spacing_mm,
      elbows: input.elbows ?? [],
      placement_positions: placementPositions,
      total_hangers_calculated: placementPositions.length,
      status: "PENDING",
      created_by: input.user_id,
    })
    .select("id")
    .single();

  if (error) {
    return res.status(500).json({ status: "FAILED", message: error.message });
  }

  return res.status(200).json({
    status: "SUCCESS",
    config_id: data.id,
    placement_positions: placementPositions,
    total_hangers: placementPositions.length,
    message: "Config saved. Waiting for add-in sync...",
  });
}
