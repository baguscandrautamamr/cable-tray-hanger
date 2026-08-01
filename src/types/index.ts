export type ConfigStatus = "PENDING" | "SYNCED" | "FAILED";

export type PlacementReason = "START" | "ELBOW" | "SPACING" | "END";

export interface CableTray {
  id: number;
  name: string;
  level: string;
  length_m: number;
}

export interface HangerFamily {
  name: string;
  type_count: number;
}

export interface Elbow {
  id?: number;
  name?: string;

  /**
   * The tray this fitting was matched to. `position_m` is measured along *that*
   * tray, so without it a position is ambiguous once a scan covers more than
   * one run. Optional only so a payload from an add-in older than this field
   * still parses; such elbows cannot be attributed to a tray and are ignored.
   */
  cable_tray_id?: number;

  /** Distance from the start of `cable_tray_id`, in metres. */
  position_m: number;
}

export interface ScanPayload {
  /** The add-in's configured project name — see VITE_PROJECT_NAME. */
  project_name: string;
  view_name: string;
  cable_trays: CableTray[];
  hanger_families: HangerFamily[];
  elbows: Elbow[];
  timestamp: string;
}

/** GET /api/latest-scan — the newest scan this user's add-in sent. */
export interface ScanRecord {
  id: string;
  project_name: string;
  view_name: string;
  cable_trays: CableTray[];
  hanger_families: HangerFamily[];
  elbows: Elbow[];
  scanned_at: string | null;
  created_at: string;
}

export interface PlacementPosition {
  pos_m: number;
  reason: PlacementReason;
}

export interface HangerConfigInput {
  // No user_id: the server takes the owner from the bearer token, so a client
  // can't attribute a config to someone else.
  project_name: string;
  cable_tray_id: number;
  cable_tray_name: string;
  cable_tray_length_m: number;
  hanger_family_name: string;
  spacing_mm: number;
  elbows: Elbow[];
  timestamp: string;
}

export interface HangerConfigResult {
  status: "SUCCESS" | "FAILED";
  config_id: string;
  placement_positions: PlacementPosition[];
  total_hangers: number;
  message: string;
}

export interface HangerConfig {
  id: string;
  project_name: string;
  cable_tray_id: string;
  cable_tray_name: string;
  cable_tray_length_m: number;
  hanger_family_name: string;
  spacing_mm: number;
  elbows: Elbow[];
  placement_positions: PlacementPosition[];
  total_hangers_calculated: number;
  status: ConfigStatus;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
  created_by: string;
  synced_by: string | null;
}

export interface PlacementStats {
  total: number;
  atElbows: number;
  atSpacing: number;
  startEnd: number;
}

export interface AddinApiKey {
  id: string;
  label: string;
  key_preview: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

/** POST /api/addin-keys — `key` is the only time the secret is readable. */
export interface CreatedAddinApiKey {
  status: "SUCCESS";
  key: string;
  record: AddinApiKey;
}

export type AlertKind = "success" | "pending" | "failed" | "info";

export interface StatusAlertData {
  kind: AlertKind;
  message: string;
}
