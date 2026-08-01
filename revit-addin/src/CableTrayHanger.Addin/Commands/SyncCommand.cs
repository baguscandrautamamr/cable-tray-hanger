using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using CableTrayHanger.Addin.Model;
using CableTrayHanger.Addin.Services;

namespace CableTrayHanger.Addin.Commands;

/// <summary>Places the pending configuration from the web app, then reports the outcome.</summary>
[Transaction(TransactionMode.Manual)]
public sealed class SyncCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
    {
        var uiDocument = commandData.Application.ActiveUIDocument;
        if (uiDocument?.Document is not { } document)
        {
            message = "Open a project before syncing.";
            return Result.Failed;
        }

        var settings = AddinSettings.Load();
        var client = new HangerApiClient(settings);

        LatestConfigDto? config;
        try
        {
            config = client.GetLatestConfig();
        }
        catch (ApiException ex)
        {
            message = ex.Message;
            return Result.Failed;
        }

        if (config is null)
        {
            TaskDialog.Show(
                "Sync Hangers",
                $"No pending configuration for {settings.ProjectName}.\n\n"
                + "Push one from the web app first.");
            return Result.Cancelled;
        }

        // Resolve everything before opening the transaction, so a lookup failure
        // leaves no empty undo entry behind.
        if (HangerPlacer.FindCableTray(document, config.CableTrayId) is not { } cableTray)
        {
            message = $"Cable tray '{config.CableTrayName}' (id {config.CableTrayId}) is not in this model. "
                      + "It may have been deleted, or the config belongs to another model.";
            return Result.Failed;
        }

        if (HangerPlacer.FindSymbol(document, config.HangerFamilyName) is not { } symbol)
        {
            message = $"Hanger family '{config.HangerFamilyName}' is not loaded in this model.";
            return Result.Failed;
        }

        PlacementOutcome outcome;
        using (var transaction = new Transaction(document, $"Place {config.TotalHangers} hangers"))
        {
            transaction.Start();
            outcome = HangerPlacer.Place(document, cableTray, symbol, config.PlacementPositions);

            if (outcome.Placed == 0)
            {
                transaction.RollBack();
                ReportOutcome(client, config, outcome, succeeded: false);
                message = "No hangers could be placed:\n\n" + string.Join("\n", outcome.Failures.Take(5));
                return Result.Failed;
            }

            transaction.Commit();
        }

        ReportOutcome(client, config, outcome, outcome.AllPlaced);

        var summary = $"Placed {outcome.Placed} of {config.PlacementPositions.Count} hangers "
                      + $"on {config.CableTrayName}.";

        if (!outcome.AllPlaced)
        {
            summary += $"\n\n{outcome.Failures.Count} could not be placed:\n"
                       + string.Join("\n", outcome.Failures.Take(5))
                       + (outcome.Failures.Count > 5 ? $"\n... and {outcome.Failures.Count - 5} more." : "")
                       + "\n\nFace-based hanger families need a host; try a level-based family.";
        }

        TaskDialog.Show("Sync Hangers", summary);
        return Result.Succeeded;
    }

    /// <summary>
    /// Best-effort status report. The hangers are already in the model at this
    /// point, so a failure to reach the server must not undo them — it is
    /// surfaced as a warning instead.
    /// </summary>
    private static void ReportOutcome(
        HangerApiClient client,
        LatestConfigDto config,
        PlacementOutcome outcome,
        bool succeeded)
    {
        try
        {
            client.ReportStatus(config.ConfigId, new ConfigStatusUpdate
            {
                Status = succeeded ? "SYNCED" : "FAILED",
                HangersPlaced = outcome.Placed,
                SyncTimestamp = DateTime.UtcNow.ToString("o"),
                SyncedBy = Environment.UserName,
            });
        }
        catch (ApiException ex)
        {
            TaskDialog.Show(
                "Sync Hangers",
                $"The hangers were placed, but the web app could not be updated:\n\n{ex.Message}\n\n"
                + "The configuration will stay PENDING and may be synced again.");
        }
    }
}
