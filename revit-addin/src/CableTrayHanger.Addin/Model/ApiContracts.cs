using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace CableTrayHanger.Addin.Model;

// Mirrors src/types/index.ts in the web app. The API speaks snake_case; the
// serializer is configured with JsonNamingPolicy.SnakeCaseLower, so property
// names only need an explicit attribute where the two disagree.

internal sealed class CableTrayDto
{
    public long Id { get; set; }
    public string Name { get; set; } = "";
    public string Level { get; set; } = "";

    [JsonPropertyName("length_m")]
    public double LengthM { get; set; }

    /// <summary>
    /// Tray width in mm. The hanger has to span the tray, so this drives the
    /// width parameter on every instance placed on this run rather than being
    /// typed into the web app a second time.
    /// </summary>
    [JsonPropertyName("width_mm")]
    public double WidthMm { get; set; }

    /// <summary>
    /// Hangers of the configured family already on this tray. The web app
    /// leaves such a tray out of a new config, so a height revised in Revit is
    /// never overwritten by a later push.
    /// </summary>
    [JsonPropertyName("existing_hanger_count")]
    public int ExistingHangerCount { get; set; }

    /// <summary>
    /// Height read off those hangers when they agree on one; null when there
    /// are none or they disagree.
    /// </summary>
    [JsonPropertyName("existing_hanger_height_mm")]
    public double? ExistingHangerHeightMm { get; set; }
}

internal sealed class HangerFamilyDto
{
    public string Name { get; set; } = "";
    public int TypeCount { get; set; }

    /// <summary>
    /// Revit category, so a hanger built as a cable tray fitting can be told
    /// apart from the elbows and transitions it sits among in the dropdown.
    /// </summary>
    public string Category { get; set; } = "";
}

internal sealed class ElbowDto
{
    public long? Id { get; set; }
    public string? Name { get; set; }

    /// <summary>
    /// The tray this fitting was matched to. PositionM is measured along *that*
    /// tray, so without it the web app cannot tell which run an elbow belongs
    /// to once a scan covers more than one.
    /// </summary>
    [JsonPropertyName("cable_tray_id")]
    public long CableTrayId { get; set; }

    /// <summary>Distance from the start of CableTrayId, in metres.</summary>
    [JsonPropertyName("position_m")]
    public double PositionM { get; set; }
}

internal sealed class ScanPayload
{
    /// <summary>
    /// The configured project name. The server files the scan under it and
    /// rejects a payload without one, because a scan under the wrong project is
    /// invisible in the web app for a reason nobody can see.
    /// </summary>
    public string ProjectName { get; set; } = "";

    public string ViewName { get; set; } = "";
    public List<CableTrayDto> CableTrays { get; set; } = [];
    public List<HangerFamilyDto> HangerFamilies { get; set; } = [];
    public List<ElbowDto> Elbows { get; set; } = [];

    /// <summary>The keyword the family list was narrowed by, for the web app to quote back.</summary>
    public string HangerFamilyKeyword { get; set; } = "";

    /// <summary>
    /// False when the keyword matched nothing and HangerFamilies is therefore
    /// every loaded family rather than a narrowed list. The web app says so, so
    /// an unhelpful keyword looks like an unhelpful keyword instead of an empty
    /// dropdown.
    /// </summary>
    public bool HangerFamiliesMatchedKeyword { get; set; }

    public string Timestamp { get; set; } = "";
}

internal sealed class PlacementPositionDto
{
    [JsonPropertyName("pos_m")]
    public double PosM { get; set; }

    public string Reason { get; set; } = "";
}

/// <summary>One cable tray inside a config, with its placement worked out.</summary>
internal sealed class ConfigTrayDto
{
    public string CableTrayId { get; set; } = "";
    public string CableTrayName { get; set; } = "";

    [JsonPropertyName("cable_tray_length_m")]
    public double CableTrayLengthM { get; set; }

    /// <summary>Copied from the tray, so the hanger can be sized to match it.</summary>
    [JsonPropertyName("tray_width_mm")]
    public double TrayWidthMm { get; set; }

    public List<PlacementPositionDto> PlacementPositions { get; set; } = [];
}

/// <summary>
/// Response of GET /api/latest-config. A config covers every tray in a scan,
/// not one picked from a dropdown, so the work arrives as a list.
/// </summary>
internal sealed class LatestConfigDto
{
    public string ConfigId { get; set; } = "";
    public string HangerFamilyName { get; set; } = "";

    /// <summary>
    /// Written onto the instances this sync creates. Never applied to hangers
    /// already in the model — those keep whatever they were revised to.
    /// </summary>
    [JsonPropertyName("hanger_height_mm")]
    public double? HangerHeightMm { get; set; }

    public List<ConfigTrayDto> Trays { get; set; } = [];
    public int TotalHangers { get; set; }
}

// --- GET /api/health -------------------------------------------------------
// Answers 200 when healthy and 503 when not, with the same body either way, so
// the Settings dialog can explain exactly what is wrong.

internal sealed class HealthEnvDto
{
    public bool SupabaseUrl { get; set; }
    public bool SupabaseServiceRoleKey { get; set; }
    public bool AddinApiKeyFallback { get; set; }
}

internal sealed class HealthDatabaseDto
{
    public bool Reachable { get; set; }
    public bool HangerConfigsTable { get; set; }
    public bool AddinApiKeysTable { get; set; }
    public bool CableTrayScansTable { get; set; }
}

internal sealed class HealthApiKeyDto
{
    public bool Provided { get; set; }
    public bool Valid { get; set; }
    public string? Label { get; set; }
}

internal sealed class HealthDto
{
    public bool Ok { get; set; }
    public HealthEnvDto Env { get; set; } = new();
    public HealthDatabaseDto Database { get; set; } = new();
    public HealthApiKeyDto ApiKey { get; set; } = new();
    public List<string> Hints { get; set; } = [];
}

/// <summary>Body of PATCH /api/config-status/:id.</summary>
internal sealed class ConfigStatusUpdate
{
    /// <summary>The server accepts "SYNCED" or "FAILED" only.</summary>
    public string Status { get; set; } = "";

    public int HangersPlaced { get; set; }
    public string SyncTimestamp { get; set; } = "";
    public string SyncedBy { get; set; } = "";
}
