-- Run this in the Supabase SQL editor for a new project.
-- For a project already running the original schema, apply
-- supabase/migrations/0001-hardening.sql instead.

CREATE TABLE hanger_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name TEXT NOT NULL,
  cable_tray_id TEXT NOT NULL,
  cable_tray_name TEXT NOT NULL,
  cable_tray_length_m FLOAT NOT NULL CHECK (cable_tray_length_m > 0),

  hanger_family_name TEXT NOT NULL,
  spacing_mm INTEGER NOT NULL DEFAULT 1500 CHECK (spacing_mm >= 100),

  elbows JSONB,
  placement_positions JSONB,
  total_hangers_calculated INTEGER,

  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SYNCED', 'FAILED')),

  -- TIMESTAMPTZ, not TIMESTAMP: the add-in, the web app and Postgres are not
  -- guaranteed to share a timezone, and a naive timestamp comes back over the
  -- API without an offset, so the browser reads it as local time.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at TIMESTAMPTZ,

  -- NOT NULL: a config with no owner is invisible to every RLS policy below.
  created_by UUID NOT NULL REFERENCES auth.users(id),
  synced_by TEXT
);

-- Supports the add-in's poll: oldest PENDING config for a project.
CREATE INDEX hanger_configs_project_status_idx
  ON hanger_configs (project_name, status, created_at);

ALTER TABLE hanger_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own configs"
  ON hanger_configs FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY "Users can insert own configs"
  ON hanger_configs FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE TABLE hanger_placement_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES hanger_configs(id) ON DELETE CASCADE,

  hangers_placed INTEGER,
  placement_positions JSONB,

  status TEXT CHECK (status IN ('SUCCESS', 'ERROR')),
  error_message TEXT,

  revit_sync_timestamp TIMESTAMPTZ,
  synced_by TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE hanger_placement_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own placement history"
  ON hanger_placement_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM hanger_configs
      WHERE hanger_configs.id = hanger_placement_history.config_id
      AND hanger_configs.created_by = auth.uid()
    )
  );

-- Add-in API keys, generated in the web app. The secret is shown once and
-- stored only as a SHA-256 hash, so a dump of this table yields nothing usable.
CREATE TABLE addin_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Names the machine the key was issued for, so the right one can be revoked.
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 60),

  -- Leading fragment of the secret, safe to display after it is hidden.
  key_preview TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

-- Every add-in request looks a key up by hash, so this is the hot path.
CREATE INDEX addin_api_keys_hash_idx
  ON addin_api_keys (key_hash) WHERE revoked_at IS NULL;

CREATE INDEX addin_api_keys_user_idx
  ON addin_api_keys (user_id, created_at DESC);

-- RLS on with no policies: reachable only through the service role, i.e. only
-- through /api/addin-keys. The anon key cannot read the hashes.
ALTER TABLE addin_api_keys ENABLE ROW LEVEL SECURITY;

-- Keep updated_at honest; nothing was maintaining it.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER hanger_configs_set_updated_at
  BEFORE UPDATE ON hanger_configs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Called by PATCH /api/config-status/:id. Marking the config and appending the
-- history row must happen together — as two separate statements, a failure
-- between them leaves a config marked SYNCED with no record of what was placed.
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

-- Only the service role (used by the API) may confirm a placement.
REVOKE EXECUTE ON FUNCTION confirm_placement(UUID, TEXT, INTEGER, TIMESTAMPTZ, TEXT)
  FROM PUBLIC, anon, authenticated;
