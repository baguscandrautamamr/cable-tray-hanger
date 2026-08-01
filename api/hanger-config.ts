import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { HangerConfigInput } from "../src/types";
import { calculatePlacements } from "../src/services/placementAlgorithm";
import { requireUser } from "./_lib/auth";
import { resolveSupabaseAdmin } from "./_lib/supabaseAdmin";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ status: "FAILED", message: "Method not allowed" });
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const supabaseAdmin = resolveSupabaseAdmin(res);
  if (!supabaseAdmin) return;

  const input = req.body as HangerConfigInput;

  if (
    !input?.project_name ||
    !input?.cable_tray_id ||
    !input?.cable_tray_name ||
    !input?.hanger_family_name
  ) {
    return res.status(400).json({ status: "FAILED", message: "Missing required fields" });
  }

  // calculatePlacements rejects a non-positive spacing or length, which would
  // otherwise leave the placement loop running forever.
  let placementPositions;
  try {
    placementPositions = calculatePlacements(
      input.cable_tray_length_m,
      input.spacing_mm,
      input.elbows ?? [],
    );
  } catch (err) {
    return res.status(400).json({
      status: "FAILED",
      message: err instanceof Error ? err.message : "Invalid placement input",
    });
  }

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
      // Always the verified token holder, never a user id taken from the body.
      created_by: user.id,
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
