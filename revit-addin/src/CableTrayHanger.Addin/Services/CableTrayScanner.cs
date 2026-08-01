using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Electrical;
using CableTrayHanger.Addin.Model;

namespace CableTrayHanger.Addin.Services;

/// <summary>Reads cable trays, their elbows and the available hanger families out of the active view.</summary>
internal static class CableTrayScanner
{
    /// <summary>
    /// How far a fitting's insertion point may sit from a tray's centreline and
    /// still count as belonging to it, in feet. Elbows join two runs, so their
    /// origin is never exactly on either centreline.
    /// </summary>
    private const double FittingToTrayToleranceFt = 2.0;

    public static ScanPayload Scan(Document document, View view, AddinSettings settings)
    {
        var trays = new FilteredElementCollector(document, view.Id)
            .OfCategory(BuiltInCategory.OST_CableTray)
            .WhereElementIsNotElementType()
            .OfType<CableTray>()
            .ToList();

        var fittings = new FilteredElementCollector(document, view.Id)
            .OfCategory(BuiltInCategory.OST_CableTrayFitting)
            .WhereElementIsNotElementType()
            .OfType<FamilyInstance>()
            .ToList();

        return new ScanPayload
        {
            ProjectName = settings.ProjectName,
            ViewName = view.Name,
            CableTrays = trays.Select(tray => ToDto(document, tray)).ToList(),
            Elbows = FindElbows(trays, fittings),
            HangerFamilies = FindHangerFamilies(document, settings.HangerFamilyKeyword),
            Timestamp = DateTime.UtcNow.ToString("o"),
        };
    }

    private static CableTrayDto ToDto(Document document, CableTray tray)
    {
        var levelName = tray.ReferenceLevel?.Name
            ?? (document.GetElement(tray.LevelId) as Level)?.Name
            ?? "";

        return new CableTrayDto
        {
            Id = tray.Id.Value,
            Name = tray.Name,
            Level = levelName,
            LengthM = UnitUtils.ConvertFromInternalUnits(GetLengthFt(tray), UnitTypeId.Meters),
        };
    }

    /// <summary>
    /// Assigns each fitting to the nearest tray and records which tray that was
    /// plus how far along it the fitting sits. Connector traversal would be
    /// exact, but a fitting's connectors point at the runs on either side rather
    /// than at one owning tray, and the web app only needs a distance along a
    /// single run.
    ///
    /// The owning tray has to travel with the position: a scan usually covers
    /// several runs, and 4.2m means nothing without saying 4.2m along *what*.
    /// </summary>
    private static List<ElbowDto> FindElbows(IReadOnlyCollection<CableTray> trays, IEnumerable<FamilyInstance> fittings)
    {
        var elbows = new List<ElbowDto>();

        foreach (var fitting in fittings)
        {
            if (fitting.Location is not LocationPoint { Point: var origin })
            {
                continue;
            }

            CableTray? bestTray = null;
            Curve? bestCurve = null;
            var bestDistance = double.MaxValue;

            foreach (var tray in trays)
            {
                if (GetCurve(tray) is not { } curve)
                {
                    continue;
                }

                var projected = curve.Project(origin);
                if (projected is not null && projected.Distance < bestDistance)
                {
                    bestDistance = projected.Distance;
                    bestCurve = curve;
                    bestTray = tray;
                }
            }

            if (bestCurve is null || bestTray is null || bestDistance > FittingToTrayToleranceFt)
            {
                continue;
            }

            var pointOnCurve = bestCurve.Project(origin).XYZPoint;
            var alongFt = bestCurve.GetEndPoint(0).DistanceTo(pointOnCurve);

            elbows.Add(new ElbowDto
            {
                Id = fitting.Id.Value,
                Name = fitting.Name,
                CableTrayId = bestTray.Id.Value,
                PositionM = UnitUtils.ConvertFromInternalUnits(alongFt, UnitTypeId.Meters),
            });
        }

        return elbows.OrderBy(e => e.CableTrayId).ThenBy(e => e.PositionM).ToList();
    }

    /// <summary>
    /// Revit has no hanger category, and offices name these families their own
    /// way, so the match is a configurable substring of the family name.
    /// </summary>
    private static List<HangerFamilyDto> FindHangerFamilies(Document document, string keyword)
    {
        var symbols = new FilteredElementCollector(document)
            .OfClass(typeof(FamilySymbol))
            .OfType<FamilySymbol>();

        if (!string.IsNullOrWhiteSpace(keyword))
        {
            symbols = symbols.Where(symbol =>
                symbol.Family.Name.Contains(keyword, StringComparison.OrdinalIgnoreCase));
        }

        return symbols
            .GroupBy(symbol => symbol.Family.Name)
            .Select(group => new HangerFamilyDto { Name = group.Key, TypeCount = group.Count() })
            .OrderBy(family => family.Name)
            .ToList();
    }

    public static Curve? GetCurve(Element element) =>
        (element.Location as LocationCurve)?.Curve;

    public static double GetLengthFt(Element element) =>
        GetCurve(element)?.Length
        ?? element.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH)?.AsDouble()
        ?? 0.0;
}
