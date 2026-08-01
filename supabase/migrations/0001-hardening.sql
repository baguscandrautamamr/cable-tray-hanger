-- Brings a project created with the original schema up to schema.sql.
-- Safe to run once, in the Supabase SQL editor. Skip this on a fresh project —
-- schema.sql already includes everything below.

BEGIN;

-- 1. Naive timestamps read back without an offset, so the browser interpreted
--    them as local time. The stored values were produced by NOW() at UTC.
ALTER TABLE hanger_configs
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC',
  ALTER COLUMN synced_at  TYPE TIMESTAMPTZ USING synced_at  AT TIME ZONE 'UTC',
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE hanger_placement_history
  ALTER COLUMN created_at           TYPE TIMESTAMPTZ USING created_at           AT TIME ZONE 'UTC',
  ALTER COLUMN revit_sync_timestamp TYPE TIMESTAMPTZ USING revit_sync_timestamp AT TIME ZONE 'UTC',
  ALTER COLUMN created_at SET NOT NULL;

-- 2. Constrain the columns the API writes. Existing rows are checked, so a
--    project holding out-of-range data will need it cleaned up first.
ALTER TABLE hanger_configs
  ALTER COLUMN status SET NOT NULL,
  ADD CONSTRAINT hanger_configs_status_check
    CHECK (status IN ('PENDING', 'SYNCED', 'FAILED')),
  ADD CONSTRAINT hanger_configs_length_check
    CHECK (cable_tray_length_m > 0),
  ADD CONSTRAINT hanger_configs_spacing_check
    CHECK (spacing_mm >= 100);

ALTER TABLE hanger_placement_history
  ADD CONSTRAINT hanger_placement_history_status_check
    CHECK (status IN ('SUCCESS', 'ERROR'));

-- 3. A config with no owner is invisible to every RLS policy. Delete or
--    reassign any orphans before this succeeds:
--      SELECT id, project_name, cable_tray_name FROM hanger_configs
--      WHERE created_by IS NULL;
ALTER TABLE hanger_configs
  ALTER COLUMN created_by SET NOT NULL;

-- 4. Index for the add-in's "oldest PENDING config for this project" poll.
CREATE INDEX IF NOT EXISTS hanger_configs_project_status_idx
  ON hanger_configs (project_name, status, created_at);

-- 5. Nothing was maintaining updated_at.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hanger_configs_set_updated_at ON hanger_configs;
CREATE TRIGGER hanger_configs_set_updated_at
  BEFORE UPDATE ON hanger_configs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 6. Transactional confirm used by PATCH /api/config-status/:id.
CREATE OR REPLACE FUNCTION confirm_placement(
  p_config_id UUID,
  p_status TEXT,
  p_hangers_placed INTEGER,
  p_sync_timestamp TIMESTAMPTZ,
  p_synced_by TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_positions JSONB;
BEGIN
  SELECT placement_positions INTO v_positions
  FROM hanger_configs
  WHERE id = p_config_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'config % not found', p_config_id;
  END IF;

  UPDATE hanger_configs
  SET status = p_status,
      synced_at = p_sync_timestamp,
      synced_by = p_synced_by
  WHERE id = p_config_id;

  INSERT INTO hanger_placement_history (
    config_id, hangers_placed, placement_positions,
    status, revit_sync_timestamp, synced_by
  ) VALUES (
    p_config_id, p_hangers_placed, v_positions,
    CASE WHEN p_status = 'SYNCED' THEN 'SUCCESS' ELSE 'ERROR' END,
    p_sync_timestamp, p_synced_by
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION confirm_placement(UUID, TEXT, INTEGER, TIMESTAMPTZ, TEXT)
  FROM PUBLIC, anon, authenticated;

COMMIT;
