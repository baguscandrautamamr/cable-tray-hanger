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
}

internal sealed class HangerFamilyDto
{
    public string Name { get; set; } = "";
    public int TypeCount { get; set; }
}

internal sealed class ElbowDto
{
    public long? Id { get; set; }
    public string? Name { get; set; }

    [JsonPropertyName("position_m")]
    public double PositionM { get; set; }
}

internal sealed class ScanPayload
{
    public string ViewName { get; set; } = "";
    public List<CableTrayDto> CableTrays { get; set; } = [];
    public List<HangerFamilyDto> HangerFamilies { get; set; } = [];
    public List<ElbowDto> Elbows { get; set; } = [];
    public string Timestamp { get; set; } = "";
}

internal sealed class PlacementPositionDto
{
    [JsonPropertyName("pos_m")]
    public double PosM { get; set; }

    public string Reason { get; set; } = "";
}

/// <summary>Response of GET /api/latest-config.</summary>
internal sealed class LatestConfigDto
{
    public string ConfigId { get; set; } = "";
    public string CableTrayId { get; set; } = "";
    public string CableTrayName { get; set; } = "";
    public string HangerFamilyName { get; set; } = "";
    public List<PlacementPositionDto> PlacementPositions { get; set; } = [];
    public int TotalHangers { get; set; }
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
