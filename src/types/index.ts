export type ConfigStatus = "PENDING" | "SYNCED" | "FAILED";

/**
 * "ELBOW" is no longer produced — a bend earns a hanger only if the spacing
 * puts one there. It stays in the union so configurations written before that
 * rule was dropped still read back.
 */
export type PlacementReason = "START" | "ELBOW" | "SPACING" | "END";

export interface CableTray {
  id: number;
  name: string;
  level: string;
  length_m: number;

  /**
   * Tray width in mm. The hanger has to span the tray, so this drives the
   * width parameter on every instance placed on this run — nobody should be
   * typing it in twice.
   */
  width_mm: number;

  /**
   * Hangers of the configured family already sitting on this tray, as found in
   * the model at scan time. A tray that has them is left out of a new config:
   * their height may have been revised in Revit, and re-placing would discard
   * that. Absent on scans from an add-in build older than this field.
   */
  existing_hanger_count?: number;

  /**
   * Height read off those existing hangers, when they agree on one. Null when
   * there are none, or when they disagree — which is worth showing as-is
   * rather than averaging into a number that matches no actual hanger.
   */
  existing_hanger_height_mm?: number | null;

  /**
   * True for a riser — a run climbing too steeply to be hung from above. A
   * hanger spaced along a vertical drop stands in mid-air beside it, so these
   * are left out of a config entirely. Absent on scans from an add-in build
   * older than this field, which reads as false.
   */
  is_vertical?: boolean;
}

export interface HangerFamily {
  name: string;
  type_count: number;

  /**
   * Revit category. A hanger built as a cable tray fitting is indistinguishable
   * from an elbow by name alone, so the dropdown shows this alongside it.
   */
  category?: string;
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

  /** The keyword the family list was narrowed by. */
  hanger_family_keyword?: string;

  /**
   * False when that keyword matched nothing, so `hanger_families` is every
   * loaded family rather than a narrowed list.
   */
  hanger_families_matched_keyword?: boolean;

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
  hanger_family_keyword: string | null;
  hanger_families_matched_keyword: boolean | null;
  scanned_at: string | null;
  created_at: string;
}

export interface PlacementPosition {
  pos_m: number;
  reason: PlacementReason;
}

/** One tray inside a config, with the placement worked out for it. */
export interface ConfigTray {
  cable_tray_id: number;
  cable_tray_name: string;
  cable_tray_length_m: number;

  /** Copied from the tray, so the add-in can size the hanger to match. */
  tray_width_mm: number;

  placement_positions: PlacementPosition[];
}

export interface HangerConfigInput {
  /**
   * The scan to build this config from. Everything else about the trays — the
   * project name, which trays there are, their lengths, widths and elbows — is
   * read server-side from this scan rather than sent by the client, so none of
   * it can be tampered with and the project name can never disagree.
   */
  scan_id: string;

  hanger_family_name: string;
  spacing_mm: number;

  /** Written onto hangers the add-in creates. */
  hanger_height_mm: number;
}

export interface HangerConfigResult {
  status: "SUCCESS" | "FAILED";
  config_id: string;
  project_name: string;
  trays: ConfigTray[];
  total_hangers: number;
  /** Trays left out because they already carry hangers. */
  skipped_trays: { cable_tray_name: string; existing_hanger_count: number }[];

  /** Trays left out because they are risers, by name. */
  vertical_trays: string[];
  message: string;
}

export interface HangerConfig {
  id: string;
  project_name: string;

  /** Null on rows written by the single-tray version of the app. */
  trays: ConfigTray[] | null;
  hanger_height_mm: number | null;

  /** Superseded by `trays`; still populated on older rows. */
  cable_tray_id: string | null;
  cable_tray_name: string | null;
  cable_tray_length_m: number | null;

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
