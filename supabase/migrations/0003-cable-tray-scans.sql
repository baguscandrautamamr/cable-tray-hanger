-- Closes the Revit -> web half of the loop.
--
-- POST /api/scan-cable-tray used to validate the add-in's payload, answer
-- SUCCESS and throw it away, so pressing "Scan Cable Tray" in Revit had no
-- visible effect and the config form listed hard-coded placeholder trays.
-- This table is where a scan now lands, and GET /api/latest-scan reads it back.

CREATE TABLE cable_tray_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner of the API key the add-in authenticated with. NULL only for the
  -- ADDIN_API_KEY environment fallback, which belongs to no account — such a
  -- scan is unreachable from the web app by design, since every read below is
  -- scoped to a user.
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- The add-in's configured project name. The web app compares it against its
  -- own VITE_PROJECT_NAME so a mismatch is reported rather than silently
  -- yielding an empty form.
  project_name TEXT NOT NULL,
  view_name TEXT NOT NULL DEFAULT '',

  cable_trays JSONB NOT NULL,
  hanger_families JSONB NOT NULL,
  elbows JSONB NOT NULL,

  -- When Revit took the scan, as opposed to when the row was written.
  scanned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Supports the only read: this user's most recent scan.
CREATE INDEX cable_tray_scans_user_idx
  ON cable_tray_scans (user_id, created_at DESC);

ALTER TABLE cable_tray_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scans"
  ON cable_tray_scans FOR SELECT
  USING (auth.uid() = user_id);
