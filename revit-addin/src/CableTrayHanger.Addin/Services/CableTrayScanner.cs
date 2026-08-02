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
    /// Reads the picked elements. `view` is only used to name the scan; hangers
    /// already in the model are looked for across the whole document.
    /// </summary>
    public static ScanPayload Scan(
        Document document,
        View view,
        IReadOnlyCollection<Element> selected,
        AddinSettings settings)
    {
        var trays = selected.OfType<CableTray>().ToList();
        var fittings = selected.OfType<FamilyInstance>().ToList();

        // Hangers are themselves cable tray fittings in at least one real
        // family ("ACT_E_SUPPORT HANGING CABEL TRAY"), so without this split
        // every hanger already in the model was counted as an elbow and earned
        // itself another hanger on the next sync.
        //
        // Existing hangers are looked for across the model rather than only in
        // the selection: leaving a revised run alone must not depend on the
        // person having remembered to select its hangers too.
        var keyword = settings.HangerFamilyKeyword;
        var hangerInstances = HangerLookup.FindInstances(document, keyword);
        var hangerIds = hangerInstances.Select(instance => instance.Id).ToHashSet();
        var elbowCandidates = fittings.Where(fitting => !hangerIds.Contains(fitting.Id));

        var centrelines = HangerLookup.Centrelines(trays);
        var existing = HangerLookup.CountPerTray(
            HangerLookup.OnTrays(centrelines, hangerInstances, settings.HangerHeightParameter));
        var (families, matchedKeyword) = FindHangerFamilies(document, keyword);

        return new ScanPayload
        {
            ProjectName = settings.ProjectName,
            ViewName = view.Name,
            CableTrays = trays.Select(tray => ToDto(document, tray, existing)).ToList(),
            Elbows = FindElbows(centrelines, elbowCandidates),
            HangerFamilies = families,
            HangerFamilyKeyword = keyword,
            HangerFamiliesMatchedKeyword = matchedKeyword,
            Timestamp = DateTime.UtcNow.ToString("o"),
        };
    }

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

    /// <summary>The tray whose centreline passes closest to a fitting, within tolerance.</summary>
    private static TrayCentreline? NearestTray(
        IReadOnlyCollection<TrayCentreline> centrelines,
        XYZ origin)
    {
        TrayCentreline? best = null;
        var bestDistance = double.MaxValue;

        foreach (var candidate in centrelines)
        {
            // Distance, not Project: it answers the only question asked in this
            // loop and does it without building an IntersectionResult per tray.
            // The winner is projected once, afterwards.
            var distance = candidate.Curve.Distance(origin);

            if (distance < bestDistance)
            {
                best = candidate;
                bestDistance = distance;
            }
        }

        return bestDistance <= FittingToTrayToleranceFt ? best : null;
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
    private static List<ElbowDto> FindElbows(
        IReadOnlyCollection<TrayCentreline> centrelines,
        IEnumerable<FamilyInstance> fittings)
    {
        var elbows = new List<ElbowDto>();

        foreach (var fitting in fittings)
        {
            if (fitting.Location is not LocationPoint { Point: var origin })
            {
                continue;
            }

            if (NearestTray(centrelines, origin) is not { } match)
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
    /// The families offered in the web app's Hanger Family dropdown.
    ///
    /// Restricted to Cable Tray Fittings, which is what a cable tray hanger is
    /// built as. Listing every loadable family in the model put hundreds of
    /// doors and pipe fittings in front of the one entry anybody wanted.
    ///
    /// Within that, the keyword narrows further — but it must never empty the
    /// list. A family called "ACT_E_SUPPORT HANGING CABEL TRAY" does not
    /// contain "hanger", and a keyword saved before the family was renamed goes
    /// on matching nothing; either way the dropdown read "no hanger families"
    /// while the family sat in the model. A keyword that matches nothing
    /// therefore falls back to every cable tray fitting family and says so.
    ///
    /// Only a real keyword match is used to recognise hangers already in the
    /// model — falling back there would class every elbow as a hanger.
    /// </summary>
    private static (List<HangerFamilyDto> Families, bool MatchedKeyword) FindHangerFamilies(
        Document document,
        string keyword)
    {
        var candidates = new FilteredElementCollector(document)
            .OfCategory(BuiltInCategory.OST_CableTrayFitting)
            .OfClass(typeof(FamilySymbol))
            .OfType<FamilySymbol>()
            .Where(symbol => symbol.Family is not null)
            .ToList();

        var matched = string.IsNullOrWhiteSpace(keyword)
            ? candidates
            : candidates.Where(symbol =>
                symbol.Family.Name.Contains(keyword, StringComparison.OrdinalIgnoreCase)).ToList();

        var matchedKeyword = matched.Count > 0;

        return (Describe(matchedKeyword ? matched : candidates), matchedKeyword);
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
    /// Tray width in internal units, or 0 for an element that has none.
    ///
    /// CableTray exposes it directly; the built-in parameter is the fallback for
    /// anything that does not. Takes an Element rather than a CableTray because
    /// Sync resolves the config's trays by id and gets Elements back.
    /// </summary>
    public static double GetWidthFt(Element element)
    {
        if (element is CableTray tray)
        {
            try
            {
                return tray.Width;
            }
            catch (Autodesk.Revit.Exceptions.ApplicationException)
            {
                // Some trays report through the parameter only.
            }
        }

        return element.get_Parameter(BuiltInParameter.RBS_CABLETRAY_WIDTH_PARAM)?.AsDouble() ?? 0.0;
    }
}
