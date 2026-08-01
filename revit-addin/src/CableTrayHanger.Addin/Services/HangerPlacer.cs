using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Structure;
using CableTrayHanger.Addin.Model;

namespace CableTrayHanger.Addin.Services;

internal sealed record PlacementOutcome(int Placed, IReadOnlyList<string> Failures)
{
    public bool AllPlaced => Failures.Count == 0;
}

/// <summary>Places hanger family instances along a cable tray at positions the web app calculated.</summary>
internal static class HangerPlacer
{
    /// <summary>
    /// Places one instance per position and sizes it to the tray. The caller
    /// owns the transaction, so a partial failure can be rolled back as a unit.
    ///
    /// Parameters are written only onto instances created here. An existing
    /// hanger is never touched: its height may have been revised in Revit, and
    /// a later push covering a different tray must not undo that.
    /// </summary>
    public static PlacementOutcome Place(
        Document document,
        Element cableTray,
        FamilySymbol symbol,
        ConfigTrayDto tray,
        double? hangerHeightMm,
        AddinSettings settings)
    {
        if (CableTrayScanner.GetCurve(cableTray) is not { } curve)
        {
            return new PlacementOutcome(0, [$"Cable tray {cableTray.Id} has no location curve to place along."]);
        }

        if (!symbol.IsActive)
        {
            // An unused family type is inactive, and NewFamilyInstance throws on
            // one. Regenerate so the activation is visible to the call below.
            symbol.Activate();
            document.Regenerate();
        }

        var level = (document.GetElement(cableTray.LevelId) as Level)
            ?? (cableTray as MEPCurve)?.ReferenceLevel;

        var lengthFt = curve.Length;
        var placed = 0;
        var failures = new List<string>();

        foreach (var position in tray.PlacementPositions)
        {
            var offsetFt = UnitUtils.ConvertToInternalUnits(position.PosM, UnitTypeId.Meters);

            // Clamp rather than skip: rounding in the web app can push the final
            // position a fraction past the end of the tray.
            var normalized = lengthFt <= 0 ? 0 : Math.Clamp(offsetFt / lengthFt, 0.0, 1.0);
            var point = curve.Evaluate(normalized, true);

            try
            {
                var instance = level is not null
                    ? document.Create.NewFamilyInstance(point, symbol, level, StructuralType.NonStructural)
                    : document.Create.NewFamilyInstance(point, symbol, StructuralType.NonStructural);

                if (instance is null)
                {
                    failures.Add($"{position.Reason} at {position.PosM:0.##}m: Revit returned no instance.");
                    continue;
                }

                ApplyDimensions(instance, tray.TrayWidthMm, hangerHeightMm, settings);
                placed++;
            }
            catch (Autodesk.Revit.Exceptions.ApplicationException ex)
            {
                // Face-based and work-plane-based hanger families reject this
                // overload. Report it rather than silently placing fewer.
                failures.Add($"{position.Reason} at {position.PosM:0.##}m: {ex.Message}");
            }
        }

        return new PlacementOutcome(placed, failures);
    }

    /// <summary>
    /// Sizes a freshly created hanger: width from the tray it spans, height
    /// from the config. A parameter the family does not have is skipped
    /// silently — every office names these differently, which is why both names
    /// are settings rather than constants.
    /// </summary>
    private static void ApplyDimensions(
        FamilyInstance instance,
        double trayWidthMm,
        double? hangerHeightMm,
        AddinSettings settings)
    {
        if (trayWidthMm > 0 && !string.IsNullOrWhiteSpace(settings.TrayWidthParameter))
        {
            ParameterUnits.TrySetMillimetres(
                instance.LookupParameter(settings.TrayWidthParameter), trayWidthMm);
        }

        if (hangerHeightMm is > 0 && !string.IsNullOrWhiteSpace(settings.HangerHeightParameter))
        {
            ParameterUnits.TrySetMillimetres(
                instance.LookupParameter(settings.HangerHeightParameter), hangerHeightMm.Value);
        }
    }

    /// <summary>Finds the family type the web app named. Falls back to any type in a matching family.</summary>
    public static FamilySymbol? FindSymbol(Document document, string familyName)
    {
        var symbols = new FilteredElementCollector(document)
            .OfClass(typeof(FamilySymbol))
            .OfType<FamilySymbol>()
            .ToList();

        return symbols.FirstOrDefault(s =>
                   string.Equals(s.Family.Name, familyName, StringComparison.OrdinalIgnoreCase))
               ?? symbols.FirstOrDefault(s =>
                   string.Equals($"{s.Family.Name} - {s.Name}", familyName, StringComparison.OrdinalIgnoreCase))
               ?? symbols.FirstOrDefault(s =>
                   s.Family.Name.Contains(familyName, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>Resolves the tray id the web app stored (a Revit ElementId, sent as a string).</summary>
    public static Element? FindCableTray(Document document, string cableTrayId) =>
        long.TryParse(cableTrayId, out var raw) ? document.GetElement(new ElementId(raw)) : null;
}
