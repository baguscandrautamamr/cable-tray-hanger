import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser } from "./_lib/auth.js";
import { resolveSupabaseAdmin } from "./_lib/supabaseAdmin.js";

/**
 * GET /api/latest-scan — the newest scan this user's add-in sent.
 *
 * Deliberately *not* filtered by project name. The web app's VITE_PROJECT_NAME
 * and the add-in's "Project name" have to match, and when they do not, filtering
 * here would answer "no scan yet" — indistinguishable from never having pressed
 * the button. Returning the scan with its own project_name lets the form say
 * which project the data actually came from.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ status: "FAILED", message: "Method not allowed" });
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const supabaseAdmin = resolveSupabaseAdmin(res);
  if (!supabaseAdmin) return;

  const { data, error } = await supabaseAdmin
    .from("cable_tray_scans")
    .select("id, project_name, view_name, cable_trays, hanger_families, elbows, scanned_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ status: "FAILED", message: error.message });
  }

  if (!data) {
    return res.status(404).json({
      status: "NOT_FOUND",
      message:
        "No scan yet. In Revit, open a view showing the cable tray run and press " +
        "Scan Cable Tray on the Cable Tray Hanger ribbon.",
    });
  }

  return res.status(200).json({ status: "SUCCESS", scan: data });
}
