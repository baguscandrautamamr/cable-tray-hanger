using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

namespace CableTrayHanger.Addin.Services;

/// <summary>A tray and its centreline, read once rather than per comparison.</summary>
internal sealed record TrayCentreline(Element Tray, Curve Curve);

/// <summary>What is already hanging on a tray, and at what height.</summary>
internal sealed record ExistingHangers(int Count, double? HeightMm);

/// <summary>
/// A hanger already standing in the model, matched to the tray it sits on.
///
/// <see cref="Spot"/> is the hanger's origin <em>projected onto the tray
/// centreline</em>, not the origin itself: every position this add-in places is
/// on that centreline, so comparing like with like is what lets a drop rod's
/// worth of height difference stop mattering.
/// </summary>
internal sealed record StandingHanger(
    ElementId Id,
    ElementId TrayId,
    Curve TrayCurve,
    HangerSpot Spot,
    double? HeightMm);

/// <summary>
/// Finds the hangers that are already in a model and says which tray each one
/// stands on.
///
/// Both halves of the loop need this and they need the same answer. The scan
/// uses it to leave a hung run out of the next configuration; the sync uses it
/// again at the moment of placement, because a scan is a snapshot and hangers
/// appear between taking one and syncing it — placed by hand, by an earlier
/// sync, or by someone else in the model. A check that can go stale is a check
/// that duplicates hangers.
/// </summary>
internal static class HangerLookup
{
    /// <summary>
    /// How far a hanger's insertion point may sit from a tray's centreline in
    /// plan and still count as standing on it, in feet.
    ///
    /// A hanger straddles its tray, so in plan its origin lands on or very near
    /// the centreline. Two feet covers the widest tray anyone hangs without
    /// reaching the run on the next ladder over.
    /// </summary>
    private const double PlanToleranceFt = 2.0;

    /// <summary>
    /// How far above or below the tray that same point may sit, in feet.
    ///
    /// This one has to be generous where the plan tolerance must not be. A
    /// hanger's insertion point is wherever the family author put it — on the
    /// tray in one family, at the top of the drop rod in the next — so the
    /// vertical gap says nothing about whether the hanger belongs to the run.
    /// Measuring in 3D instead, as the elbow match does, stops recognising
    /// hangers the moment the drop exceeds the tolerance, and an unrecognised
    /// hanger is a duplicated one.
    /// </summary>
    private const double VerticalToleranceFt = 10.0;

    /// <summary>
    /// Straight-line distance beyond which no point can satisfy both tolerances,
    /// used to reject a tray without projecting onto it. The closest point on a
    /// curve is exactly sqrt(plan² + vertical²) away, so this rejects only what
    /// the real test would have rejected anyway.
    /// </summary>
    private static readonly double MaxSeparationFt =
        Math.Sqrt((PlanToleranceFt * PlanToleranceFt) + (VerticalToleranceFt * VerticalToleranceFt));

    /// <summary>
    /// Two hangers count as agreeing on a height if they are within this many
    /// millimetres, so a rounding difference does not read as a disagreement.
    /// </summary>
    private const double HeightAgreementMm = 1.0;

    public static List<TrayCentreline> Centrelines(IEnumerable<Element> trays) =>
        trays
            .Select(tray => (Tray: tray, Curve: CableTrayScanner.GetCurve(tray)))
            .Where(entry => entry.Curve is not null)
            .Select(entry => new TrayCentreline(entry.Tray, entry.Curve!))
            .ToList();

    /// <summary>
    /// Every family instance in the model whose family name contains the
    /// keyword, whatever category it sits in — offices build these as cable tray
    /// fittings, generic models or structural framing depending on the family.
    ///
    /// The whole document, deliberately, rather than the active view. A hanger
    /// hidden by a view filter, cropped out by a section box or sitting on a
    /// worksct that is closed is still in the model and still occupies its
    /// place on the tray; scoping the search to a view made whether a run got
    /// duplicate hangers depend on what happened to be visible when somebody
    /// pressed Scan. Nothing is claimed by breadth alone — a hanger still has to
    /// stand on one of the trays in question to count.
    /// </summary>
    public static List<FamilyInstance> FindInstances(Document document, string keyword)
    {
        if (string.IsNullOrWhiteSpace(keyword))
        {
            // Everything would match, which would report the whole model as
            // existing hangers and empty the elbow list. Better to report
            // nothing than to report nonsense.
            return [];
        }

        try
        {
            return new FilteredElementCollector(document)
                .OfClass(typeof(FamilyInstance))
                .OfType<FamilyInstance>()
                .Where(instance =>
                    instance.Symbol?.Family?.Name is { } name
                    && name.Contains(keyword, StringComparison.OrdinalIgnoreCase))
                .ToList();
        }
        catch (Autodesk.Revit.Exceptions.ApplicationException)
        {
            // Finding no existing hangers only means no run is skipped; it is
            // not worth failing the scan over.
            return [];
        }
    }

    /// <summary>
    /// Matches each hanger to the tray it stands on, dropping the ones that
    /// stand on none of them.
    /// </summary>
    public static List<StandingHanger> OnTrays(
        IReadOnlyCollection<TrayCentreline> centrelines,
        IEnumerable<FamilyInstance> hangers,
        string heightParameter)
    {
        var standing = new List<StandingHanger>();

        if (centrelines.Count == 0)
        {
            return standing;
        }

        foreach (var hanger in hangers)
        {
            if (Origin(hanger) is not { } origin)
            {
                continue;
            }

            if (NearestTray(centrelines, origin) is not { } match)
            {
                continue;
            }

            var height = string.IsNullOrWhiteSpace(heightParameter)
                ? null
                : ParameterUnits.TryGetMillimetres(hanger.LookupParameter(heightParameter));

            standing.Add(new StandingHanger(
                hanger.Id,
                match.Tray.Tray.Id,
                match.Tray.Curve,
                match.Spot,
                height));
        }

        return standing;
    }

    /// <summary>How many hangers stand on each tray, and the height they share.</summary>
    public static Dictionary<ElementId, ExistingHangers> CountPerTray(
        IEnumerable<StandingHanger> standing) =>
        standing
            .GroupBy(hanger => hanger.TrayId)
            .ToDictionary(
                group => group.Key,
                group => new ExistingHangers(
                    group.Count(),
                    AgreedHeight(group.Select(hanger => hanger.HeightMm).ToList())));

    /// <summary>
    /// The height a group of hangers is at, or null when they disagree. A
    /// disagreement yields null rather than an average: the point of the number
    /// is to say what is actually in the model.
    /// </summary>
    public static double? AgreedHeight(IReadOnlyCollection<double?> heights)
    {
        var known = heights.Where(height => height.HasValue).Select(height => height!.Value).ToList();

        if (known.Count == 0)
        {
            return null;
        }

        return known.Max() - known.Min() <= HeightAgreementMm ? known[0] : null;
    }

    /// <summary>
    /// Where a hanger sits. Point-based families are the normal case; a
    /// line-based one is measured from the middle of its own curve.
    /// </summary>
    private static XYZ? Origin(FamilyInstance instance) => instance.Location switch
    {
        LocationPoint point => point.Point,
        LocationCurve { Curve: var curve } => curve.Evaluate(0.5, true),
        _ => null,
    };

    private sealed record TrayHit(TrayCentreline Tray, HangerSpot Spot, double PlanDistanceFt);

    /// <summary>
    /// The tray whose centreline passes closest to a point in plan, within both
    /// tolerances. Ties broken by plan distance, so a hanger at a bend goes to
    /// the run it is actually over.
    /// </summary>
    private static TrayHit? NearestTray(
        IReadOnlyCollection<TrayCentreline> centrelines,
        XYZ origin)
    {
        TrayHit? best = null;

        foreach (var candidate in centrelines)
        {
            // Cheap rejection before the projection: on a floor's worth of
            // selection this pairing runs tens of thousands of times, and most
            // pairs are nowhere near each other.
            if (candidate.Curve.Distance(origin) > MaxSeparationFt)
            {
                continue;
            }

            if (candidate.Curve.Project(origin) is not { } projection)
            {
                continue;
            }

            var point = projection.XYZPoint;
            var planFt = Math.Sqrt(
                ((point.X - origin.X) * (point.X - origin.X))
                + ((point.Y - origin.Y) * (point.Y - origin.Y)));

            if (planFt > PlanToleranceFt || Math.Abs(point.Z - origin.Z) > VerticalToleranceFt)
            {
                continue;
            }

            if (best is not null && planFt >= best.PlanDistanceFt)
            {
                continue;
            }

            // Measured from the start of the run, the same way HangerPlacer
            // turns a position in metres into one — so an existing hanger and a
            // scheduled one are on the same scale rather than on two that agree
            // only for straight trays.
            var lengthFt = candidate.Curve.Length;
            var alongFt = candidate.Curve.GetEndPoint(0).DistanceTo(point);
            var normalized = lengthFt <= 0 ? 0.0 : Math.Clamp(alongFt / lengthFt, 0.0, 1.0);

            best = new TrayHit(candidate, new HangerSpot(normalized, point), planFt);
        }

        return best;
    }
}
