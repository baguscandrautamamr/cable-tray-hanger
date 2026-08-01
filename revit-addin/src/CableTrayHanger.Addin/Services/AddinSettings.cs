using System;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace CableTrayHanger.Addin.Services;

/// <summary>
/// User-level configuration, stored as JSON under %APPDATA%. The API key is a
/// per-installation secret, so it deliberately lives outside the repository and
/// outside the Revit model.
/// </summary>
internal sealed class AddinSettings
{
    [JsonPropertyName("apiBaseUrl")]
    public string ApiBaseUrl { get; set; } = "https://cable-tray-hanger.vercel.app";

    /// <summary>Matches ADDIN_API_KEY on the server; sent as the x-api-key header.</summary>
    [JsonPropertyName("apiKey")]
    public string ApiKey { get; set; } = "";

    /// <summary>Scopes the add-in to one Revit project in the web app.</summary>
    [JsonPropertyName("projectName")]
    public string ProjectName { get; set; } = "HBE-ELECTRICAL-E";

    /// <summary>
    /// Case-insensitive substring used to pick hanger families out of the
    /// model. Revit has no "hanger" category, and offices name these families
    /// differently, so it has to be configurable.
    /// </summary>
    [JsonPropertyName("hangerFamilyKeyword")]
    public string HangerFamilyKeyword { get; set; } = "hanger";

    [JsonIgnore]
    public bool IsConfigured => !string.IsNullOrWhiteSpace(ApiBaseUrl) && !string.IsNullOrWhiteSpace(ApiKey);

    private static readonly JsonSerializerOptions FileJson = new() { WriteIndented = true };

    public static string SettingsPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "CableTrayHanger",
        "settings.json");

    public static AddinSettings Load()
    {
        try
        {
            if (File.Exists(SettingsPath))
            {
                var loaded = JsonSerializer.Deserialize<AddinSettings>(File.ReadAllText(SettingsPath));
                if (loaded is not null)
                {
                    return loaded;
                }
            }
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            // A corrupt or unreadable file shouldn't stop Revit from starting;
            // the caller reports "not configured" and the user can re-save.
        }

        return new AddinSettings();
    }

    public void Save()
    {
        var directory = Path.GetDirectoryName(SettingsPath);
        if (directory is not null)
        {
            Directory.CreateDirectory(directory);
        }

        File.WriteAllText(SettingsPath, JsonSerializer.Serialize(this, FileJson));
    }

    /// <summary>Writes a template on first use so there is something to edit.</summary>
    public static string EnsureFileExists()
    {
        if (!File.Exists(SettingsPath))
        {
            new AddinSettings().Save();
        }

        return SettingsPath;
    }
}
