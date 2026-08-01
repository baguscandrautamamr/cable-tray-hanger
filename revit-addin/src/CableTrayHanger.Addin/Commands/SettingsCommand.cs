using System;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using CableTrayHanger.Addin.Services;
using CableTrayHanger.Addin.UI;

namespace CableTrayHanger.Addin.Commands;

/// <summary>
/// Opens the settings dialog. Values are still persisted to
/// %APPDATA%\CableTrayHanger\settings.json, so an IT deployment can push that
/// file to a machine instead of having someone fill the form in.
/// </summary>
[Transaction(TransactionMode.ReadOnly)]
public sealed class SettingsCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
    {
        try
        {
            var settings = AddinSettings.Load();
            var window = new SettingsWindow(settings);

            window.ShowDialogOver(commandData.Application.MainWindowHandle);

            return window.DialogResult == true ? Result.Succeeded : Result.Cancelled;
        }
        catch (Exception ex)
        {
            message = $"Could not open Settings: {ex.Message}\n\n"
                      + $"The settings file is at {AddinSettings.SettingsPath} and can be edited by hand.";
            return Result.Failed;
        }
    }
}
