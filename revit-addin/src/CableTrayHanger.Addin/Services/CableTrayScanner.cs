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

    /// <summary>
    /// Two existing hangers count as the same height if they agree to within
    /// this many millimetres, so a rounding difference does not read as a
    /// disagreement.
    /// </summary>
    private const double HeightAgreementMm = 1.0;

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

        // Hangers are themselves cable tray fittings in at least one real
        // family ("ACT_E_SUPPORT HANGING CABEL TRAY"), so without this split
        // every hanger already in the model was counted as an elbow and earned
        // itself another hanger on the next sync.
        var keyword = settings.HangerFamilyKeyword;
        var hangerInstances = FindHangerInstances(document, view, keyword);
        var hangerIds = hangerInstances.Select(instance => instance.Id).ToHashSet();
        var elbowCandidates = fittings.Where(fitting => !hangerIds.Contains(fitting.Id));

        var existing = CountHangersPerTray(trays, hangerInstances, settings.HangerHeightParameter);
        var (families, matchedKeyword) = FindHangerFamilies(document, keyword);

        return new ScanPayload
        {
            ProjectName = settings.ProjectName,
            ViewName = view.Name,
            CableTrays = trays.Select(tray => ToDto(document, tray, existing)).ToList(),
            Elbows = FindElbows(trays, elbowCandidates),
            HangerFamilies = families,
            HangerFamilyKeyword = keyword,
            HangerFamiliesMatchedKeyword = matchedKeyword,
            Timestamp = DateTime.UtcNow.ToString("o"),
        };
    }

    /// <summary>What is already hanging on a tray, and at what height.</summary>
    private sealed record ExistingHangers(int Count, double? HeightMm);

    private static CableTrayDto ToDto(
        Document document,
        CableTray tray,
        IReadOnlyDictionary<ElementId, ExistingHangers> existing)
    {
        var levelName = tray.ReferenceLevel?.Name
            ?? (document.GetElement(tray.LevelId) as Level)?.Name
            ?? "";

        var found = existing.TryGetValue(tray.Id, out var hangers) ? hangers : null;

        return new CableTrayDto
        {
            Id = tray.Id.Value,
            Name = tray.Name,
            Level = levelName,
            LengthM = UnitUtils.ConvertFromInternalUnits(GetLengthFt(tray), UnitTypeId.Meters),
            WidthMm = UnitUtils.ConvertFromInternalUnits(GetWidthFt(tray), UnitTypeId.Millimeters),
            ExistingHangerCount = found?.Count ?? 0,
            ExistingHangerHeightMm = found?.HeightMm,
        };
    }

    /// <summary>
    /// Every loaded instance whose family matches the hanger keyword, whatever
    /// category it sits in — offices build these as cable tray fittings,
    /// generic models or structural framing depending on the family.
    /// </summary>
    private static List<FamilyInstance> FindHangerInstances(Document document, View view, string keyword)
    {
        if (string.IsNullOrWhiteSpace(keyword))
        {
            // Everything would match, which would empty the elbow list and
            // report the whole model as existing hangers. Better to report
            // nothing than to report nonsense.
            return [];
        }

        return new FilteredElementCollector(document, view.Id)
            .OfClass(typeof(FamilyInstance))
            .OfType<FamilyInstance>()
            .Where(instance =>
                instance.Symbol?.Family?.Name is { } name
                && name.Contains(keyword, StringComparison.OrdinalIgnoreCase))
            .ToList();
    }

    /// <summary>
    /// Groups existing hangers onto the tray they sit on, and reports the
    /// height they share. A disagreement yields null rather than an average:
    /// the point of the number is to say what is actually in the model.
    /// </summary>
    private static Dictionary<ElementId, ExistingHangers> CountHangersPerTray(
        IReadOnlyCollection<CableTray> trays,
        IEnumerable<FamilyInstance> hangers,
        string heightParameter)
    {
        var perTray = new Dictionary<ElementId, List<double?>>();

        foreach (var hanger in hangers)
        {
            if (hanger.Location is not LocationPoint { Point: var origin })
            {
                continue;
            }

            if (NearestTray(trays, origin) is not { } match)
            {
                continue;
            }

            var height = string.IsNullOrWhiteSpace(heightParameter)
                ? null
                : ParameterUnits.TryGetMillimetres(hanger.LookupParameter(heightParameter));

            if (!perTray.TryGetValue(match.Tray.Id, out var heights))
            {
                heights = [];
                perTray[match.Tray.Id] = heights;
            }

            heights.Add(height);
        }

        return perTray.ToDictionary(
            entry => entry.Key,
            entry => new ExistingHangers(entry.Value.Count, AgreedHeight(entry.Value)));
    }

    private static double? AgreedHeight(List<double?> heights)
    {
        var known = heights.Where(height => height.HasValue).Select(height => height!.Value).ToList();

        if (known.Count == 0)
        {
            return null;
        }

        return known.Max() - known.Min() <= HeightAgreementMm ? known[0] : null;
    }

    private sealed record TrayMatch(CableTray Tray, Curve Curve, double Distance);

    /// <summary>The tray whose centreline passes closest to a point, within tolerance.</summary>
    private static TrayMatch? NearestTray(IReadOnlyCollection<CableTray> trays, XYZ origin)
    {
        TrayMatch? best = null;

        foreach (var tray in trays)
        {
            if (GetCurve(tray) is not { } curve)
            {
                continue;
            }

            var projected = curve.Project(origin);
            if (projected is not null && (best is null || projected.Distance < best.Distance))
            {
                best = new TrayMatch(tray, curve, projected.Distance);
            }
        }

        return best is not null && best.Distance <= FittingToTrayToleranceFt ? best : null;
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

            if (NearestTray(trays, origin) is not { } match)
            {
                continue;
            }

            var pointOnCurve = match.Curve.Project(origin).XYZPoint;
            var alongFt = match.Curve.GetEndPoint(0).DistanceTo(pointOnCurve);

            elbows.Add(new ElbowDto
            {
                Id = fitting.Id.Value,
                Name = fitting.Name,
                CableTrayId = match.Tray.Id.Value,
                PositionM = UnitUtils.ConvertFromInternalUnits(alongFt, UnitTypeId.Meters),
            });
        }

        return elbows.OrderBy(e => e.CableTrayId).ThenBy(e => e.PositionM).ToList();
    }

    /// <summary>
    /// Revit has no hanger category, and offices name these families their own
    /// way, so the match is a configurable substring of the family name.
    /// </summary>
    /// <summary>
    /// The families offered in the web app's Hanger Family dropdown.
    ///
    /// The keyword narrows the list, but it must never empty it. A hanger
    /// family called "ACT_E_SUPPORT HANGING CABEL TRAY" does not contain
    /// "hanger", and a keyword saved before the family was renamed goes on
    /// matching nothing — either way the dropdown read "No hanger families
    /// scanned yet" with no way forward, and nothing in the model was wrong.
    ///
    /// So a keyword that matches nothing falls back to every loaded family and
    /// says so, which leaves the person a list to pick from instead of a dead
    /// end. Only the narrowed match is used to recognise hangers already in the
    /// model — falling back there would class every fitting as a hanger.
    /// </summary>
    private static (List<HangerFamilyDto> Families, bool MatchedKeyword) FindHangerFamilies(
        Document document,
        string keyword)
    {
        var all = new FilteredElementCollector(document)
            .OfClass(typeof(FamilySymbol))
            .OfType<FamilySymbol>()
            .Where(symbol => symbol.Family is not null)
            .ToList();

        var matched = string.IsNullOrWhiteSpace(keyword)
            ? all
            : all.Where(symbol =>
                symbol.Family.Name.Contains(keyword, StringComparison.OrdinalIgnoreCase)).ToList();

        var matchedKeyword = matched.Count > 0;

        return (Describe(matchedKeyword ? matched : all), matchedKeyword);
    }

    /// <summary>
    /// Groups symbols by family, carrying the category so two similarly named
    /// families can be told apart in a dropdown — a hanger built as a cable
    /// tray fitting looks like every other fitting by name alone.
    /// </summary>
    private static List<HangerFamilyDto> Describe(List<FamilySymbol> symbols) =>
        symbols
            .GroupBy(symbol => symbol.Family.Name)
            .Select(group => new HangerFamilyDto
            {
                Name = group.Key,
                TypeCount = group.Count(),
                Category = group.First().Category?.Name ?? "",
            })
            .OrderBy(family => family.Name)
            .ToList();

    public static Curve? GetCurve(Element element) =>
        (element.Location as LocationCurve)?.Curve;

    public static double GetLengthFt(Element element) =>
        GetCurve(element)?.Length
        ?? element.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH)?.AsDouble()
        ?? 0.0;

    /// <summary>
    /// Tray width in internal units. CableTray exposes it directly; the
    /// built-in parameter is the fallback for anything that does not.
    /// </summary>
    private static double GetWidthFt(CableTray tray)
    {
        try
        {
            return tray.Width;
        }
        catch (Autodesk.Revit.Exceptions.ApplicationException)
        {
            return tray.get_Parameter(BuiltInParameter.RBS_CABLETRAY_WIDTH_PARAM)?.AsDouble() ?? 0.0;
        }
    }
}
