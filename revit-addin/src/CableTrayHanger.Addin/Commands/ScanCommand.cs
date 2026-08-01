using System;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using CableTrayHanger.Addin.Services;

namespace CableTrayHanger.Addin.Commands;

/// <summary>Sends the active view's cable trays, elbows and hanger families to the web app.</summary>
[Transaction(TransactionMode.ReadOnly)]
public sealed class ScanCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
    {
        // Anything unhandled here becomes Revit's "Command Failure for External
        // Command" dialog, which names no cause. Report what actually went
        // wrong instead.
        try
        {
            return Run(commandData, ref message);
        }
        catch (Exception ex)
        {
            message = $"{ex.GetType().Name}: {ex.Message}";
            return Result.Failed;
        }
    }

    private static Result Run(ExternalCommandData commandData, ref string message)
    {
        var uiDocument = commandData.Application.ActiveUIDocument;
        if (uiDocument?.Document is not { } document)
        {
            message = "Open a project before scanning.";
            return Result.Failed;
        }

        var view = document.ActiveView;
        if (view is null || !view.CanBePrinted)
        {
            // Schedules and sheets have no model geometry to collect.
            message = "Switch to a model view (plan, section or 3D) before scanning.";
            return Result.Failed;
        }

        var settings = AddinSettings.Load();

        try
        {
            var payload = CableTrayScanner.Scan(document, view, settings);

            if (payload.CableTrays.Count == 0)
            {
                TaskDialog.Show(
                    "Scan Cable Tray",
                    $"No cable trays are visible in '{view.Name}'.\n\n"
                    + "Check the view's visibility settings, or switch to a view that shows the run.");
                return Result.Cancelled;
            }

            new HangerApiClient(settings).SubmitScan(payload);

            TaskDialog.Show(
                "Scan Cable Tray",
                $"Sent from '{view.Name}':\n\n"
                + $"  Cable trays: {payload.CableTrays.Count}\n"
                + $"  Elbows: {payload.Elbows.Count}\n"
                + $"  Hanger families: {payload.HangerFamilies.Count}\n\n"
                + $"Open the web app to configure the placement for {settings.ProjectName}.");

            return Result.Succeeded;
        }
        catch (ApiException ex)
        {
            message = ex.Message;
            return Result.Failed;
        }
    }
}
