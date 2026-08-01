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
  position_m: number;
}

export interface ScanPayload {
  view_name: string;
  cable_trays: CableTray[];
  hanger_families: HangerFamily[];
  elbows: Elbow[];
  timestamp: string;
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

export type AlertKind = "success" | "pending" | "failed" | "info";

export interface StatusAlertData {
  kind: AlertKind;
  message: string;
}
