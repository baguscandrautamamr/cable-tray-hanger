using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Selection;
using CableTrayHanger.Addin.Services;

namespace CableTrayHanger.Addin.Commands;

/// <summary>Sends the cable trays and fittings you pick to the web app.</summary>
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

        var settings = AddinSettings.Load();

        // Picking beats collecting the whole active view. A 3D view shows every
        // run in the model, including ones on other levels and ones already
        // done, and there was no way to say "these ones". What you select is
        // what gets hangers.
        var selected = PickTrays(uiDocument);

        if (selected is null)
        {
            // Escape, or Finish with nothing picked.
            return Result.Cancelled;
        }

        try
        {
            var payload = CableTrayScanner.Scan(document, uiDocument.ActiveView, selected, settings);

            if (payload.CableTrays.Count == 0)
            {
                TaskDialog.Show(
                    "Scan Cable Tray",
                    "Nothing you selected is a cable tray.\n\n"
                    + "Select the runs themselves, not only their fittings.");
                return Result.Cancelled;
            }

            new HangerApiClient(settings).SubmitScan(payload);

            TaskDialog.Show(
                "Scan Cable Tray",
                "Sent:\n\n"
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

    /// <summary>
    /// Whatever is already selected, or a fresh pick when nothing is. Null
    /// means the user cancelled, which is not a failure to report.
    /// </summary>
    private static IReadOnlyCollection<Element>? PickTrays(UIDocument uiDocument)
    {
        var document = uiDocument.Document;
        var filter = new CableTraySelectionFilter();

        var preselected = uiDocument.Selection.GetElementIds()
            .Select(id => document.GetElement(id))
            .Where(element => element is not null && filter.AllowElement(element))
            .ToList();

        if (preselected.Count > 0)
        {
            return preselected;
        }

        try
        {
            var picked = uiDocument.Selection
                .PickObjects(
                    ObjectType.Element,
                    filter,
                    "Select cable trays and their fittings, then click Finish")
                .Select(reference => document.GetElement(reference))
                .Where(element => element is not null)
                .ToList();

            return picked.Count > 0 ? picked : null;
        }
        catch (Autodesk.Revit.Exceptions.OperationCanceledException)
        {
            return null;
        }
    }
}
