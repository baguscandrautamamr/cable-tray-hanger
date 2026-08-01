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

    /// <summary>
    /// What a tray id that resolves to nothing actually means. Revit hands an
    /// element a new id when it is redrawn, split or joined, so a run that was
    /// edited after the scan is a different element by the time Sync looks for
    /// it — the id in the configuration belongs to something that no longer
    /// exists.
    /// </summary>
    private const string StaleScanAdvice =
        "Those trays were in the model when the scan was taken. Editing a run gives it a new "
        + "id, so a configuration built from an older scan can no longer find it. Run Scan "
        + "Cable Tray again, push a new configuration from the web app, and sync that.";

    private static string Describe(ConfigTrayDto tray) =>
        $"{tray.CableTrayName} (id {tray.CableTrayId}): "
        + $"not in this model — {tray.PlacementPositions.Count} hangers.";

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

        // Kept apart from the failures: a tray that is not here did not fail to
        // take its hangers, it was never reached, and it takes all of its
        // positions down with it. Lumping the two together is what made a
        // dialog say "10 could not be placed" about three trays.
        var missing = new List<ConfigTrayDto>();

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
                missing.Add(tray);
            }
        }

        if (resolved.Count == 0)
        {
            message = "None of the configuration's cable trays are in this model:\n\n"
                      + string.Join("\n", missing.Take(MaxReportedFailures).Select(Describe))
                      + "\n\n" + StaleScanAdvice;
            return Result.Failed;
        }

        var placed = 0;

        // Which family type each tray width resolved to, so the dialog can show
        // that a 600 tray really did get the 600 type.
        var typesUsed = new SortedSet<string>();

        // Shared by every tray in the run: two trays meeting at a bend each
        // schedule a hanger at the joint, and only their coordinates say that
        // is one place rather than two.
        var placedHangers = new PlacedHangers();

        // A dimension the family would not take. The hangers are standing; it
        // is the size that is not what was asked for.
        var warnings = new List<string>();

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
                    document,
                    element,
                    symbol,
                    tray,
                    config.HangerHeightMm,
                    settings,
                    placedHangers,
                    // Once. It measures a built hanger to catch a dimension that
                    // went in wrong, and answers the same for the second tray as
                    // for the first — at the price of a full regeneration each
                    // time it is asked.
                    verifyGeometry: placed == 0);

                placed += outcome.Placed;
                failures.AddRange(outcome.Failures.Select(failure => $"{tray.CableTrayName}: {failure}"));

                if (outcome.Warning is { } warning)
                {
                    warnings.Add($"{tray.CableTrayName}: {warning}");
                }
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

        // A warning is not a failure: those hangers are in the model. Only a
        // tray that was never reached, or a position Revit refused, is.
        var allPlaced = failures.Count == 0 && missing.Count == 0;
        ReportOutcome(client, config, placed, allPlaced);

        var summary = $"Placed {placed} of {config.TotalHangers} hangers "
                      + $"across {resolved.Count} of {config.Trays.Count} cable trays.";

        // Account for every hanger that is not in the model, by name. "Placed
        // 41 of 68" on its own invites the reading that 27 went wrong, when
        // most of them were never attempted and some were never wanted.
        var lost = missing.Sum(tray => tray.PlacementPositions.Count);
        var unaccounted = new List<string>();

        if (lost > 0)
        {
            unaccounted.Add(
                $"{lost} belong to {missing.Count} cable "
                + $"{(missing.Count == 1 ? "tray that is" : "trays that are")} not in this model");
        }

        if (placedHangers.Skipped > 0)
        {
            unaccounted.Add(
                $"{placedHangers.Skipped} were already served — where two trays meet, the joint "
                + "takes one hanger rather than one from each side");
        }

        if (failures.Count > 0)
        {
            unaccounted.Add($"{failures.Count} were refused by Revit");
        }

        if (unaccounted.Count > 0)
        {
            summary += $"\n\nOf the other {config.TotalHangers - placed}:\n  "
                       + string.Join("\n  ", unaccounted);
        }

        if (missing.Count > 0)
        {
            summary += "\n\n" + string.Join("\n", missing.Take(MaxReportedFailures).Select(Describe))
                       + (missing.Count > MaxReportedFailures
                           ? $"\n... and {missing.Count - MaxReportedFailures} more."
                           : "")
                       + "\n\n" + StaleScanAdvice;
        }

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

        if (warnings.Count > 0)
        {
            summary += $"\n\nThe hangers are placed, but {warnings.Count} of the "
                       + $"{resolved.Count} trays did not take a dimension:\n"
                       + string.Join("\n", warnings.Take(MaxReportedFailures))
                       + (warnings.Count > MaxReportedFailures
                           ? $"\n... and {warnings.Count - MaxReportedFailures} more."
                           : "")
                       + "\n\nA dimension the family holds its own value for has to be changed on "
                       + "the family type, not the instance — or point Settings at the parameter "
                       + "that really drives it.";
        }

        if (failures.Count > 0)
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
