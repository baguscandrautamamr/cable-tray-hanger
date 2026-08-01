using System;
using System.Collections.Generic;
using System.Linq;
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
    /// <summary>How many individual failures to spell out before summarising.</summary>
    private const int MaxReportedFailures = 5;

    public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
    {
        // Anything unhandled here becomes Revit's "Command Failure for External
        // Command" dialog, which names no cause and offers nothing to act on.
        // Naming the exception is the difference between a bug report and a
        // shrug.
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

        if (config.Trays.Count == 0)
        {
            message = "That configuration contains no cable trays.";
            return Result.Failed;
        }

        // Resolve everything before opening the transaction, so a lookup failure
        // leaves no empty undo entry behind.
        var symbols = HangerPlacer.FindFamilySymbols(document, config.HangerFamilyName);

        if (symbols.Count == 0)
        {
            message = $"Hanger family '{config.HangerFamilyName}' is not loaded in this model.";
            return Result.Failed;
        }

        var resolved = new List<(ConfigTrayDto Tray, Element Element)>();
        var failures = new List<string>();

        foreach (var tray in config.Trays)
        {
            if (HangerPlacer.FindCableTray(document, tray.CableTrayId) is { } element)
            {
                resolved.Add((tray, element));
            }
            else
            {
                // A tray deleted since the scan, or a config from another model.
                // One missing tray should not stop the other six being placed.
                failures.Add($"{tray.CableTrayName} (id {tray.CableTrayId}): not in this model.");
            }
        }

        if (resolved.Count == 0)
        {
            message = "None of the configuration's cable trays are in this model:\n\n"
                      + string.Join("\n", failures.Take(MaxReportedFailures));
            return Result.Failed;
        }

        var placed = 0;

        // Which family type each tray width resolved to, so the dialog can show
        // that a 600 tray really did get the 600 type.
        var typesUsed = new SortedSet<string>();

        // One transaction for the whole run: a half-placed model is worse than
        // an unplaced one, and a single undo should take all of it back.
        using (var transaction = new Transaction(document, $"Place {config.TotalHangers} hangers"))
        {
            transaction.Start();

            foreach (var (tray, element) in resolved)
            {
                // One type per width is the family author's job; picking the
                // right one is ours.
                var symbol = HangerPlacer.PickSymbolForWidth(symbols, tray.TrayWidthMm, settings);

                if (symbol is null)
                {
                    failures.Add($"{tray.CableTrayName}: no type available in the hanger family.");
                    continue;
                }

                typesUsed.Add($"{Math.Round(tray.TrayWidthMm)}mm → {symbol.Name}");

                var outcome = HangerPlacer.Place(
                    document, element, symbol, tray, config.HangerHeightMm, settings);

                placed += outcome.Placed;
                failures.AddRange(outcome.Failures.Select(failure => $"{tray.CableTrayName}: {failure}"));
            }

            if (placed == 0)
            {
                transaction.RollBack();
                ReportOutcome(client, config, 0, succeeded: false);
                message = "No hangers could be placed:\n\n"
                          + string.Join("\n", failures.Take(MaxReportedFailures));
                return Result.Failed;
            }

            transaction.Commit();
        }

        var allPlaced = failures.Count == 0;
        ReportOutcome(client, config, placed, allPlaced);

        var summary = $"Placed {placed} of {config.TotalHangers} hangers "
                      + $"across {resolved.Count} of {config.Trays.Count} cable trays.";

        if (config.HangerHeightMm is > 0)
        {
            summary += $"\n\nHeight set to {config.HangerHeightMm:0.##}mm.";
        }

        if (typesUsed.Count > 0)
        {
            summary += $"\n\nType used per tray width:\n  {string.Join("\n  ", typesUsed)}";

            if (symbols.Count == 1)
            {
                summary += $"\n\nThis family has one type, so the width was written onto each "
                           + $"instance instead. A type per width (100…1000) is steadier — the "
                           + $"add-in picks it by the type's {settings.TrayWidthParameter} value, "
                           + "or by a number in the type name.";
            }
        }

        if (!allPlaced)
        {
            summary += $"\n\n{failures.Count} could not be placed:\n"
                       + string.Join("\n", failures.Take(MaxReportedFailures))
                       + (failures.Count > MaxReportedFailures
                           ? $"\n... and {failures.Count - MaxReportedFailures} more."
                           : "")
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
        int placed,
        bool succeeded)
    {
        try
        {
            client.ReportStatus(config.ConfigId, new ConfigStatusUpdate
            {
                Status = succeeded ? "SYNCED" : "FAILED",
                HangersPlaced = placed,
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
