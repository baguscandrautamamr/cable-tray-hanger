using System;
using System.Diagnostics;
using System.IO;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using CableTrayHanger.Addin.Services;

namespace CableTrayHanger.Addin.Commands;

/// <summary>
/// Opens settings.json in the system's default editor. A JSON file rather than
/// a dialog: it keeps the API key out of the Revit model and out of any shared
/// location, and it is what an IT deployment can push to a machine.
/// </summary>
[Transaction(TransactionMode.ReadOnly)]
public sealed class SettingsCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
    {
        try
        {
            var path = AddinSettings.EnsureFileExists();

            Process.Start(new ProcessStartInfo(path) { UseShellExecute = true })?.Dispose();

            TaskDialog.Show(
                "Cable Tray Hanger Settings",
                $"Editing:\n{path}\n\n"
                + "  apiBaseUrl  — where the web app is deployed\n"
                + "  apiKey      — must match ADDIN_API_KEY on the server\n"
                + "  projectName — the project this model syncs with\n"
                + "  hangerFamilyKeyword — substring used to find hanger families\n\n"
                + "Save the file, then use Scan or Sync. Revit does not need restarting.");

            return Result.Succeeded;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or System.ComponentModel.Win32Exception)
        {
            message = $"Could not open the settings file: {ex.Message}\n\nExpected at {AddinSettings.SettingsPath}";
            return Result.Failed;
        }
    }
}
