import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { ScanPayload } from "../src/types/index.js";
import { requireAddinKey } from "./_lib/auth.js";
import { resolveSupabaseAdmin } from "./_lib/supabaseAdmin.js";

/**
 * POST /api/scan-cable-tray — what the add-in's "Scan Cable Tray" button sends.
 *
 * This used to validate the payload, answer SUCCESS and discard it, so the
 * button had no visible effect in the browser and the config form listed
 * hard-coded placeholder trays. The scan is now stored, and the form reads it
 * back through GET /api/latest-scan.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ status: "FAILED", message: "Method not allowed" });
  }

  const caller = await requireAddinKey(req, res);
  if (!caller) return;

  const supabaseAdmin = resolveSupabaseAdmin(res);
  if (!supabaseAdmin) return;

  const payload = req.body as ScanPayload;

  if (
    !Array.isArray(payload?.cable_trays) ||
    !Array.isArray(payload?.hanger_families) ||
    !Array.isArray(payload?.elbows)
  ) {
    return res.status(400).json({
      status: "FAILED",
      message: "cable_trays, hanger_families and elbows must each be an array",
    });
  }

  // Required, not defaulted: a scan filed under the wrong project is invisible
  // in the web app for a reason nobody can see. Add-in builds predating this
  // field get told exactly what to do about it.
  const projectName = typeof payload.project_name === "string" ? payload.project_name.trim() : "";

  if (!projectName) {
    return res.status(400).json({
      status: "FAILED",
      message:
        "Missing project_name. This add-in build predates that field — rebuild the " +
        "add-in from revit-addin/ so the scan is filed under the right project.",
    });
  }

  const { data, error } = await supabaseAdmin
    .from("cable_tray_scans")
    .insert({
      // Never from the body: the owner is whoever the API key belongs to.
      user_id: caller.userId,
      project_name: projectName,
      view_name: typeof payload.view_name === "string" ? payload.view_name : "",
      cable_trays: payload.cable_trays,
      hanger_families: payload.hanger_families,
      elbows: payload.elbows,
      hanger_family_keyword: payload.hanger_family_keyword ?? null,
      // Null, not false, on add-in builds that predate the field: the web app
      // only warns about a fallback it has actually been told about.
      hanger_families_matched_keyword: payload.hanger_families_matched_keyword ?? null,
      scanned_at: payload.timestamp || null,
    })
    .select("id")
    .single();

  if (error) {
    return res.status(500).json({ status: "FAILED", message: error.message });
  }

  return res.status(200).json({
    status: "SUCCESS",
    scan_id: data.id,
    cable_trays_received: payload.cable_trays.length,
    hanger_families_received: payload.hanger_families.length,
    elbows_received: payload.elbows.length,
    // The environment fallback key has no owner, so nothing in the web app can
    // read the row back. Say so rather than reporting a plain success that
    // leads to an empty form.
    message: caller.userId
      ? "Scan saved. Open the web app to configure the placement."
      : "Scan saved, but this deployment's ADDIN_API_KEY belongs to no account, so it " +
        "will not appear in the web app. Generate a key under API Keys instead.",
  });
}
