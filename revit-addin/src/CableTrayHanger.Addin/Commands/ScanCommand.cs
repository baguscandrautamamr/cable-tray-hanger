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

            var hung = payload.CableTrays.Count(tray => tray.ExistingHangerCount > 0);

            TaskDialog.Show(
                "Scan Cable Tray",
                "Sent:\n\n"
                + $"  Cable trays: {payload.CableTrays.Count} ({hung} already have hangers)\n"
                + $"  Elbows: {payload.Elbows.Count}\n"
                + $"  Hanger families: {payload.HangerFamilies.Count}\n\n"
                + DescribeExisting(hung, payload.CableTrays.Count, settings)
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
    /// Says what the scan concluded about hangers already in the model, which
    /// is the one number on the dialog that is worth checking against what you
    /// can see on screen.
    ///
    /// A count of zero on runs that visibly have hangers means the keyword does
    /// not match the family, and until that showed up here it showed up nowhere:
    /// the web app's family dropdown falls back to listing every cable tray
    /// fitting when the keyword matches nothing, so it looks perfectly normal
    /// while the tray-is-already-hung check quietly does nothing.
    /// </summary>
    private static string DescribeExisting(int hung, int trays, AddinSettings settings)
    {
        if (hung > 0)
        {
            return $"Those {hung} will be left out of the next config, so nothing is added to them "
                   + "and no height you revised in Revit is overwritten.\n\n";
        }

        return "No tray was found to already have hangers. If some of these runs do, the Hanger "
               + $"family keyword — currently \"{settings.HangerFamilyKeyword}\" — does not match "
               + "your hanger family's name; set it in Settings and scan again.\n\n"
               + "Sync will refuse to place a hanger where one already stands either way, since it "
               + "recognises the family it is about to place without needing the keyword. The "
               + $"keyword is what lets the web app tell you in advance, and it is why {trays} "
               + "trays are about to be listed as empty.\n\n";
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
