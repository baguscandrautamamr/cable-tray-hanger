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

    /// <summary>
    /// Sent as the x-api-key header. Normally a key generated in the web app
    /// under "API Keys", which is revocable and scoped to one account; the
    /// server also accepts its ADDIN_API_KEY environment variable as a
    /// fallback for installs with no account behind them.
    /// </summary>
    [JsonPropertyName("apiKey")]
    public string ApiKey { get; set; } = "";

    /// <summary>
    /// Scopes the add-in to one Revit project in the web app. Must match the
    /// web app's VITE_PROJECT_NAME exactly — the web app stamps that string
    /// onto every config it pushes, and this one is what we poll for, so a
    /// mismatch shows up only as "No pending configuration".
    /// </summary>
    [JsonPropertyName("projectName")]
    public string ProjectName { get; set; } = "HBE-ELECTRICAL-E";

    /// <summary>
    /// Case-insensitive substring used to pick hanger families out of the
    /// model. Revit has no "hanger" category, and offices name these families
    /// differently, so it has to be configurable.
    ///
    /// "hang" rather than "hanger": it matches Hanger, Hangers and HANGING
    /// alike, and real families are named things like
    /// "ACT_E_SUPPORT HANGING CABEL TRAY", which "hanger" misses entirely.
    /// </summary>
    [JsonPropertyName("hangerFamilyKeyword")]
    public string HangerFamilyKeyword { get; set; } = "hang";

    /// <summary>
    /// Instance parameter on the hanger family that holds the tray width. The
    /// add-in writes each tray's own width into it, so one config can serve
    /// runs of different widths without anyone typing a number twice.
    /// Blank switches the behaviour off.
    /// </summary>
    [JsonPropertyName("trayWidthParameter")]
    public string TrayWidthParameter { get; set; } = "TRAY_W";

    /// <summary>
    /// Instance parameter holding the hanger's drop height. Written only onto
    /// instances this add-in creates — an existing hanger keeps whatever it was
    /// revised to in Revit. Blank switches the behaviour off.
    /// </summary>
    [JsonPropertyName("hangerHeightParameter")]
    public string HangerHeightParameter { get; set; } = "Height Support";

    /// <summary>
    /// Degrees to turn a hanger after aligning it with the run.
    ///
    /// A family authored to sit across the tray needs 90 from a family authored
    /// to sit along it, and nothing in the model says which one you have. 90 is
    /// the default because a hanger normally straddles the tray. If they come
    /// out facing the wrong way, this is the one number to change.
    /// </summary>
    [JsonPropertyName("hangerRotationDegrees")]
    public double HangerRotationDegrees { get; set; } = 90;

    /// <summary>
    /// ProjectName counts: the server files a scan under it and rejects a
    /// payload without one, and Sync Hangers polls by it. Leaving it out here
    /// turned a blank field into a puzzling 400 from the server rather than the
    /// "not configured yet" message that points at the Settings dialog.
    /// </summary>
    [JsonIgnore]
    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(ApiBaseUrl)
        && !string.IsNullOrWhiteSpace(ApiKey)
        && !string.IsNullOrWhiteSpace(ProjectName);

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
                    return Migrate(loaded);
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

    /// <summary>The family keyword this add-in used to ship with.</summary>
    private const string SupersededKeyword = "hanger";

    /// <summary>
    /// Brings a settings file written by an earlier build up to date.
    ///
    /// A new default only reaches a fresh install: everyone who ever opened the
    /// dialog has the old value saved under %APPDATA% and keeps it forever. The
    /// old "hanger" matches neither "HANGING" nor a family renamed since, which
    /// showed up as an empty Hanger Family dropdown with nothing visibly wrong.
    /// Only the exact superseded default is replaced, so a keyword somebody
    /// deliberately typed is left alone.
    /// </summary>
    private static AddinSettings Migrate(AddinSettings settings)
    {
        if (string.Equals(settings.HangerFamilyKeyword, SupersededKeyword, StringComparison.OrdinalIgnoreCase))
        {
            settings.HangerFamilyKeyword = new AddinSettings().HangerFamilyKeyword;
        }

        return settings;
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
