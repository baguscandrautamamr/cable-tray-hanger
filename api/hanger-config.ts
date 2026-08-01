import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { CableTray, ConfigTray, Elbow, HangerConfigInput } from "../src/types/index.js";
import { calculatePlacements } from "../src/services/placementAlgorithm.js";
import { requireUser } from "./_lib/auth.js";
import { resolveSupabaseAdmin } from "./_lib/supabaseAdmin.js";

/**
 * POST /api/hanger-config — turn a scan into a pending placement.
 *
 * The request names a scan and the three things a person actually decides:
 * which hanger family, how far apart, and how high. Everything about the trays
 * comes out of the stored scan, so the client cannot contradict it and the
 * config's project name is by construction the one the add-in scanned under.
 *
 * A config covers *every* tray in the scan. Picking them one at a time was the
 * slow part of the job, and there is rarely anything to choose between: a run
 * needs hangers along all of it.
 */
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

  if (typeof input?.scan_id !== "string" || !input.scan_id) {
    return res.status(400).json({ status: "FAILED", message: "Missing scan_id" });
  }

  if (typeof input.hanger_family_name !== "string" || !input.hanger_family_name.trim()) {
    return res.status(400).json({ status: "FAILED", message: "Missing hanger_family_name" });
  }

  if (!Number.isFinite(input.hanger_height_mm) || input.hanger_height_mm <= 0) {
    return res.status(400).json({
      status: "FAILED",
      message: "hanger_height_mm must be greater than 0",
    });
  }

  // Scoped to the caller: a scan id is a UUID, but it is not a secret.
  const { data: scan, error: scanError } = await supabaseAdmin
    .from("cable_tray_scans")
    .select("id, project_name, cable_trays, elbows")
    .eq("id", input.scan_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (scanError) {
    return res.status(500).json({ status: "FAILED", message: scanError.message });
  }

  if (!scan) {
    return res.status(404).json({ status: "FAILED", message: "Scan not found" });
  }

  const scannedTrays = (scan.cable_trays ?? []) as CableTray[];
  const scannedElbows = (scan.elbows ?? []) as Elbow[];

  if (scannedTrays.length === 0) {
    return res.status(400).json({ status: "FAILED", message: "That scan contains no cable trays" });
  }

  // Trays that already carry hangers are left alone. Their height may have
  // been revised in Revit, and re-placing would quietly discard that revision.
  const skipped = scannedTrays
    .filter((tray) => (tray.existing_hanger_count ?? 0) > 0)
    .map((tray) => ({
      cable_tray_name: tray.name,
      existing_hanger_count: tray.existing_hanger_count ?? 0,
    }));

  const trays: ConfigTray[] = [];
  const rejected: string[] = [];

  for (const tray of scannedTrays) {
    if ((tray.existing_hanger_count ?? 0) > 0) continue;

    // An elbow's position is measured along the tray it was matched to, so
    // only that tray's own elbows apply.
    const elbows = scannedElbows.filter((elbow) => elbow.cable_tray_id === tray.id);

    try {
      trays.push({
        cable_tray_id: tray.id,
        cable_tray_name: tray.name,
        cable_tray_length_m: tray.length_m,
        tray_width_mm: tray.width_mm,
        placement_positions: calculatePlacements(tray.length_m, input.spacing_mm, elbows),
      });
    } catch (err) {
      // One unusable tray — a zero-length stub, say — must not sink the whole
      // run. Collect it and carry on.
      rejected.push(`${tray.name}: ${err instanceof Error ? err.message : "invalid geometry"}`);
    }
  }

  if (trays.length === 0) {
    return res.status(400).json({
      status: "FAILED",
      message:
        rejected.length === 0
          ? "Every tray in this scan already has hangers. Nothing left to place."
          : `No tray could be placed. ${rejected.join("; ")}`,
    });
  }

  const totalHangers = trays.reduce((sum, tray) => sum + tray.placement_positions.length, 0);

  const { data, error } = await supabaseAdmin
    .from("hanger_configs")
    .insert({
      // Straight from the scan, so the add-in polls for the same string.
      project_name: scan.project_name,
      scan_id: scan.id,
      trays,
      hanger_family_name: input.hanger_family_name.trim(),
      spacing_mm: input.spacing_mm,
      hanger_height_mm: Math.round(input.hanger_height_mm),
      total_hangers_calculated: totalHangers,
      status: "PENDING",
      // Always the verified token holder, never a user id taken from the body.
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    return res.status(500).json({ status: "FAILED", message: error.message });
  }

  const notes = [
    `${trays.length} ${trays.length === 1 ? "tray" : "trays"}, ${totalHangers} hangers.`,
    skipped.length > 0 ? `${skipped.length} left untouched — they already have hangers.` : "",
    rejected.length > 0 ? `Skipped: ${rejected.join("; ")}` : "",
  ].filter(Boolean);

  return res.status(200).json({
    status: "SUCCESS",
    config_id: data.id,
    project_name: scan.project_name,
    trays,
    total_hangers: totalHangers,
    skipped_trays: skipped,
    message: `Config saved. ${notes.join(" ")} Waiting for add-in sync...`,
  });
}
