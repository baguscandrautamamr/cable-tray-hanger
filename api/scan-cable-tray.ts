import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { ScanPayload } from "../src/types";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ status: "FAILED", message: "Method not allowed" });
  }

  const payload = req.body as ScanPayload;

  if (!payload?.cable_trays || !payload?.hanger_families || !payload?.elbows) {
    return res.status(400).json({
      status: "FAILED",
      message: "Missing cable_trays, hanger_families, or elbows in request body",
    });
  }

  return res.status(200).json({
    status: "SUCCESS",
    cable_trays_received: payload.cable_trays.length,
    hanger_families_received: payload.hanger_families.length,
    elbows_received: payload.elbows.length,
    message: "Scan data received. Go to website to configure.",
  });
}
