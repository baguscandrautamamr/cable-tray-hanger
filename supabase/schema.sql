-- Run this in the Supabase SQL editor for a new project.

CREATE TABLE hanger_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name TEXT NOT NULL,
  cable_tray_id TEXT NOT NULL,
  cable_tray_name TEXT NOT NULL,
  cable_tray_length_m FLOAT NOT NULL,

  hanger_family_name TEXT NOT NULL,
  spacing_mm INTEGER NOT NULL DEFAULT 1500,

  elbows JSONB,
  placement_positions JSONB,
  total_hangers_calculated INTEGER,

  status TEXT DEFAULT 'PENDING',

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  synced_at TIMESTAMP,

  created_by UUID REFERENCES auth.users(id),
  synced_by TEXT
);

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

  status TEXT,
  error_message TEXT,

  revit_sync_timestamp TIMESTAMP,
  synced_by TEXT,

  created_at TIMESTAMP DEFAULT NOW()
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
