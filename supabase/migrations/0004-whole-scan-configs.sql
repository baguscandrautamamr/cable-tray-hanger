-- A config used to cover exactly one cable tray, picked from a dropdown. In
-- practice a scan covers a whole run — seven trays in one 3D view — and picking
-- them one at a time is the slow part of the job. A config now covers every
-- tray in a scan, so the trays move into a JSONB array and the single-tray
-- columns become optional.
--
-- Also adds the hanger height the web app collects, which the add-in writes
-- onto the instances it creates.

ALTER TABLE hanger_configs
  -- Which scan this was built from. The server reads the trays, their widths
  -- and the project name out of it rather than trusting the request body.
  ADD COLUMN scan_id UUID REFERENCES cable_tray_scans(id) ON DELETE SET NULL,

  -- Applied to hangers the add-in creates, never to ones already in the model.
  ADD COLUMN hanger_height_mm INTEGER
    CHECK (hanger_height_mm IS NULL OR hanger_height_mm > 0),

  -- [{cable_tray_id, cable_tray_name, cable_tray_length_m, tray_width_mm,
  --   placement_positions:[{pos_m, reason}]}, ...]
  ADD COLUMN trays JSONB;

-- Rows written before this migration still carry a single tray in these
-- columns, so they stay readable; new rows leave them NULL and use `trays`.
ALTER TABLE hanger_configs
  ALTER COLUMN cable_tray_id DROP NOT NULL,
  ALTER COLUMN cable_tray_name DROP NOT NULL,
  ALTER COLUMN cable_tray_length_m DROP NOT NULL;
