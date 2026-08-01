using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Structure;
using CableTrayHanger.Addin.Model;

namespace CableTrayHanger.Addin.Services;

/// <summary>
/// What one tray's worth of placement did.
///
/// `Warning` is kept apart from `Failures` because it is not one: a dimension
/// the family would not take describes hangers that are standing in the model,
/// and counting it as a failure made "10 could not be placed" mean ten
/// messages rather than ten hangers.
/// </summary>
internal sealed record PlacementOutcome(int Placed, IReadOnlyList<string> Failures, string? Warning);

/// <summary>A place on a tray to build a hanger, as a point and the curve parameter it came from.</summary>
internal sealed record HangerSpot(double Normalized, XYZ Point);

/// <summary>
/// Keeps the hangers of one sync out of each other's way.
///
/// Positions arrive from the web app measured along one tray at a time, and
/// nothing in that payload says two trays meet: it carries lengths and offsets,
/// not coordinates. So a bend built from two runs puts the END hanger of one
/// and the START hanger of the next within inches of each other, and only the
/// add-in is in a position to see it, because only the add-in knows where the
/// points actually are.
///
/// Both of them move. Each slides along its own tray, away from the other, by
/// half of what the pair is short — so the bend keeps its support on both
/// sides instead of one hanger being dropped, and neither ends up where the
/// spacing did not ask for it. A tray with no room to slide gives its share of
/// the shift to the other one; if there is still no room, the position is
/// skipped rather than built inside its neighbour.
/// </summary>
internal sealed class PlacedHangers
{
    /// <summary>
    /// The least room a hanger takes along a tray, in millimetres, whatever the
    /// tray says it is. A tray that reports no width still has a bracket.
    /// </summary>
    private const double MinFootprintMm = 300.0;

    /// <summary>A hanger standing in the model, and what it would take to move it.</summary>
    private sealed class Standing(ElementId id, Curve curve, double halfFootprintFt, HangerSpot spot)
    {
        public ElementId Id { get; } = id;
        public Curve Curve { get; } = curve;
        public double HalfFootprintFt { get; } = halfFootprintFt;
        public HangerSpot Spot { get; set; } = spot;
    }

    private readonly List<Standing> _standing = [];

    /// <summary>Pairs pushed apart so they clear each other at a joint.</summary>
    public int Separated { get; private set; }

    /// <summary>Positions dropped because no amount of sliding made room.</summary>
    public int Skipped { get; private set; }

    /// <summary>
    /// A hanger straddles its tray, so the room it needs is the tray's own
    /// width. Two 600 trays meeting at a bend want 600mm between their hangers;
    /// 300mm is what stops two narrow ones from touching.
    /// </summary>
    private static double HalfFootprintFt(double trayWidthMm) =>
        UnitUtils.ConvertToInternalUnits(Math.Max(trayWidthMm, MinFootprintMm), UnitTypeId.Millimeters)
        / 2.0;

    /// <summary>
    /// Finds room for a hanger at `spot`, moving what is already there if it
    /// has to. Returns where to build it, or null when there is no room.
    /// </summary>
    public HangerSpot? MakeRoom(Document document, Curve curve, double trayWidthMm, HangerSpot spot)
    {
        var halfFt = HalfFootprintFt(trayWidthMm);

        if (Clash(spot.Point, halfFt, null) is not { } other)
        {
            return spot;
        }

        // Half the shortfall each. Both are at the joint, so "away from the
        // other" is into their own runs, in opposite directions.
        var half = Shortfall(spot.Point, halfFt, other) / 2.0;

        if (Slide(other.Curve, other.Spot, spot.Point, half) is { } moved
            && Clash(moved.Point, other.HalfFootprintFt, other) is null
            && Move(document, other, moved))
        {
            other.Spot = moved;
        }

        // Measured again rather than assumed: a hanger that would not move —
        // pinned, or on a tray with nowhere to go — leaves the whole shift to
        // this one.
        if (Slide(curve, spot, other.Spot.Point, Shortfall(spot.Point, halfFt, other)) is { } mine)
        {
            spot = mine;
        }

        if (Clash(spot.Point, halfFt, null) is not null)
        {
            // Two stubs shorter than the hangers they carry. Better one hanger
            // at the joint than two inside each other.
            Skipped++;
            return null;
        }

        Separated++;
        return spot;
    }

    /// <summary>
    /// Records a hanger that is now standing here. Called after Revit has built
    /// it, not before: a position Revit refuses leaves nothing in the model, and
    /// must not push its neighbour aside for a hanger that never appeared.
    /// </summary>
    public void Claim(ElementId id, Curve curve, double trayWidthMm, HangerSpot spot) =>
        _standing.Add(new Standing(id, curve, HalfFootprintFt(trayWidthMm), spot));

    /// <summary>How far short of clearing each other the two are.</summary>
    private static double Shortfall(XYZ point, double halfFt, Standing other) =>
        halfFt + other.HalfFootprintFt - other.Spot.Point.DistanceTo(point);

    /// <summary>The first standing hanger this one would be inside, if any.</summary>
    private Standing? Clash(XYZ point, double halfFt, Standing? ignoring) =>
        _standing.FirstOrDefault(standing =>
            !ReferenceEquals(standing, ignoring)
            && standing.Spot.Point.DistanceTo(point) < halfFt + standing.HalfFootprintFt);

    /// <summary>
    /// Steps a spot along its own tray, in whichever direction takes it further
    /// from `away`. Clamped to the tray, so a short run simply moves less.
    /// </summary>
    private static HangerSpot? Slide(Curve curve, HangerSpot spot, XYZ away, double distanceFt)
    {
        var lengthFt = curve.Length;

        if (lengthFt <= 0 || distanceFt <= 0)
        {
            return null;
        }

        var step = distanceFt / lengthFt;
        var forward = Math.Clamp(spot.Normalized + step, 0.0, 1.0);
        var backward = Math.Clamp(spot.Normalized - step, 0.0, 1.0);

        var forwardPoint = curve.Evaluate(forward, true);
        var backwardPoint = curve.Evaluate(backward, true);

        return forwardPoint.DistanceTo(away) >= backwardPoint.DistanceTo(away)
            ? new HangerSpot(forward, forwardPoint)
            : new HangerSpot(backward, backwardPoint);
    }

    /// <summary>Slides a hanger that is already in the model. False if it would not go.</summary>
    private static bool Move(Document document, Standing standing, HangerSpot target)
    {
        try
        {
            return document.GetElement(standing.Id)?.Location is { } location
                   && location.Move(target.Point - standing.Spot.Point);
        }
        catch (Autodesk.Revit.Exceptions.ApplicationException)
        {
            // Pinned, or constrained to something. The other one takes the
            // whole shift instead.
            return false;
        }
    }
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
    ///
    /// `placedHangers` spans the whole sync rather than this tray, so the joint
    /// two runs share gets one hanger instead of one from each side.
    /// </summary>
    public static PlacementOutcome Place(
        Document document,
        Element cableTray,
        FamilySymbol symbol,
        ConfigTrayDto tray,
        double? hangerHeightMm,
        AddinSettings settings,
        PlacedHangers placedHangers,
        bool verifyGeometry)
    {
        if (CableTrayScanner.GetCurve(cableTray) is not { } curve)
        {
            return new PlacementOutcome(
                0,
                [$"Cable tray {cableTray.Id} has no location curve to place along."],
                null);
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

        // Recorded once per tray, not once per hanger: a parameter that lands
        // wrong lands wrong for all fifteen of them.
        string? dimensionProblem = null;

        foreach (var position in tray.PlacementPositions)
        {
            var offsetFt = UnitUtils.ConvertToInternalUnits(position.PosM, UnitTypeId.Meters);

            // Clamp rather than skip: rounding in the web app can push the final
            // position a fraction past the end of the tray.
            var normalized = lengthFt <= 0 ? 0 : Math.Clamp(offsetFt / lengthFt, 0.0, 1.0);
            var wanted = new HangerSpot(normalized, curve.Evaluate(normalized, true));

            // Where the joint is shared with another run, this comes back
            // shifted along the tray — and the hanger on the other side has
            // already stepped back the other way. Not a failure either way.
            if (placedHangers.MakeRoom(document, curve, tray.TrayWidthMm, wanted) is not { } spot)
            {
                continue;
            }

            try
            {
                var instance = level is not null
                    ? document.Create.NewFamilyInstance(spot.Point, symbol, level, StructuralType.NonStructural)
                    : document.Create.NewFamilyInstance(spot.Point, symbol, StructuralType.NonStructural);

                if (instance is null)
                {
                    failures.Add($"{position.Reason} at {position.PosM:0.##}m: Revit returned no instance.");
                    continue;
                }

                placedHangers.Claim(instance.Id, curve, tray.TrayWidthMm, spot);

                var firstOnThisTray = placed == 0;

                // Every hanger is sized, and only the first complaint is kept.
                // Writing this as `dimensionProblem ??= ApplyDimensions(...)`
                // skipped the call itself once a problem was recorded, so on a
                // tray whose height would not take, every hanger after the
                // first was left at the family's own width as well.
                var problem = ApplyDimensions(instance, tray.TrayWidthMm, hangerHeightMm, settings);
                dimensionProblem ??= problem;

                AlignToRun(instance, curve, spot, settings);
                placed++;

                if (firstOnThisTray && verifyGeometry)
                {
                    dimensionProblem ??= CheckPlausibleSize(document, instance, tray.CableTrayName);
                }
            }
            catch (Autodesk.Revit.Exceptions.ApplicationException ex)
            {
                // Face-based and work-plane-based hanger families reject this
                // overload. Report it rather than silently placing fewer.
                failures.Add($"{position.Reason} at {position.PosM:0.##}m: {ex.Message}");
            }
        }

        return new PlacementOutcome(placed, failures, dimensionProblem);
    }

    /// <summary>
    /// Turns a hanger to face along the run it sits on.
    ///
    /// NewFamilyInstance places every instance at the family's own orientation,
    /// so without this a run heading east and a run heading north get hangers
    /// pointing the same way, and only one of them straddles its tray. The tray
    /// direction was known all along — it just never reached the model.
    ///
    /// Rotation is about the vertical through the insertion point, by the
    /// heading of the curve's tangent there, so it follows a curved run too.
    /// A failure to rotate leaves a correctly placed hanger badly turned, which
    /// is worth reporting nowhere and undoing nothing.
    /// </summary>
    private static void AlignToRun(
        FamilyInstance instance,
        Curve curve,
        HangerSpot spot,
        AddinSettings settings)
    {
        var tangent = curve.ComputeDerivatives(spot.Normalized, true).BasisX;
        var heading = new XYZ(tangent.X, tangent.Y, 0);

        // A perfectly vertical run has no heading to align to.
        if (heading.IsZeroLength())
        {
            return;
        }

        // Plus whatever the family needs on top: one authored across the tray
        // sits 90 degrees from one authored along it, and the model does not
        // say which you have.
        var angle = XYZ.BasisX.AngleOnPlaneTo(heading.Normalize(), XYZ.BasisZ)
                    + (settings.HangerRotationDegrees * Math.PI / 180.0);

        if (Math.Abs(angle) < 1e-9)
        {
            return;
        }

        try
        {
            var axis = Line.CreateBound(spot.Point, spot.Point + XYZ.BasisZ);

            // instance.Location.Rotate, not ElementTransformUtils.RotateElement:
            // the latter regenerates the document on every call, which is one
            // full regeneration per hanger and the single heaviest thing this
            // command did. Rotating through the element's own Location leaves
            // the regeneration to Revit, which does it once.
            instance.Location?.Rotate(axis, angle);
        }
        catch (Autodesk.Revit.Exceptions.ApplicationException)
        {
            // Some families pin or constrain their rotation. The hanger is
            // already placed and sized; leave it be.
        }
    }

    /// <summary>
    /// Sizes a freshly created hanger: width from the tray it spans, height
    /// from the config. A parameter the family does not have is skipped
    /// silently — every office names these differently, which is why both names
    /// are settings rather than constants.
    /// </summary>
    /// <summary>
    /// No cable tray hanger is this wide. Anything past it is not a hanger that
    /// needs a second look, it is a unit that went in wrong.
    /// </summary>
    private const double ImplausibleSpanMetres = 10.0;

    /// <summary>
    /// Measures the hanger that was just built and complains if it came out
    /// absurd.
    ///
    /// This is the check that would have caught TRAY_W landing at 182,880mm,
    /// and reading the parameter back would not have: reading uses the same
    /// units assumption as writing, so when that assumption is wrong both
    /// sides are wrong together and agree perfectly. A bounding box owes
    /// nothing to the assumption — it is the geometry Revit actually built.
    /// </summary>
    private static string? CheckPlausibleSize(Document document, FamilyInstance instance, string trayName)
    {
        try
        {
            // The instance was built from the old parameter values; without
            // this its box still describes the shape before they were set.
            document.Regenerate();

            if (instance.get_BoundingBox(null) is not { } box)
            {
                return null;
            }

            var spanFt = Math.Max(box.Max.X - box.Min.X, box.Max.Y - box.Min.Y);
            var spanM = UnitUtils.ConvertFromInternalUnits(spanFt, UnitTypeId.Meters);

            if (spanM <= ImplausibleSpanMetres)
            {
                return null;
            }

            return $"On {trayName} the hanger came out {spanM:0.#}m across, which is not a hanger. "
                   + "A dimension went into the family in the wrong units — check the Tray width "
                   + "and Hanger height parameter names in Settings against the family.";
        }
        catch (Autodesk.Revit.Exceptions.ApplicationException)
        {
            // No geometry to measure. Not a reason to fail the placement.
            return null;
        }
    }

    /// <summary>Returns a description of anything that did not land, or null.</summary>
    private static string? ApplyDimensions(
        FamilyInstance instance,
        double trayWidthMm,
        double? hangerHeightMm,
        AddinSettings settings)
    {
        var problems = new List<string>();

        if (trayWidthMm > 0)
        {
            Verify(instance, settings.TrayWidthParameter, trayWidthMm, problems);
        }

        if (hangerHeightMm is > 0)
        {
            Verify(instance, settings.HangerHeightParameter, hangerHeightMm.Value, problems);
        }

        return problems.Count == 0 ? null : string.Join("; ", problems);
    }

    /// <summary>
    /// Millimetres a written value may differ from the requested one and still
    /// count as landed — enough to absorb Revit's internal-unit round trip.
    /// </summary>
    private const double ToleranceMm = 0.5;

    /// <summary>
    /// Writes a dimension and reads it back.
    ///
    /// This catches a parameter that is read-only, formula-driven, or of a type
    /// that will not hold the value. It deliberately does *not* catch a units
    /// mistake: reading uses the same assumption as writing, so when that
    /// assumption is wrong both sides agree on the wrong answer.
    /// CheckPlausibleSize measures the built geometry for that.
    /// </summary>
    private static void Verify(
        FamilyInstance instance,
        string parameterName,
        double expectedMm,
        List<string> problems)
    {
        if (string.IsNullOrWhiteSpace(parameterName))
        {
            return;
        }

        var parameter = instance.LookupParameter(parameterName);

        if (parameter is null)
        {
            // The family simply does not have it; that is a configuration
            // choice, not a fault.
            return;
        }

        if (!ParameterUnits.TrySetMillimetres(parameter, expectedMm))
        {
            problems.Add($"'{parameterName}' could not be set (read-only, or not a number).");
            return;
        }

        // Read back through the same Parameter object rather than looking the
        // name up again. A model can carry two parameters of one name — a family
        // parameter and a project parameter bound to the category — and a second
        // lookup is free to hand back the other one, which would report a value
        // that landed perfectly well as having been ignored.
        var actual = ParameterUnits.TryGetMillimetres(parameter);

        if (actual is null || Math.Abs(actual.Value - expectedMm) > ToleranceMm)
        {
            problems.Add(
                $"'{parameterName}' was set to {expectedMm:0.##}mm but reads back as "
                + $"{actual?.ToString("0.##") ?? "nothing"}mm — the family is holding its own "
                + "value, so that dimension is driven by the type or by a locked constraint "
                + "rather than by the instance.");
        }
    }

    /// <summary>Every type of the family the web app named, most exact match first.</summary>
    public static List<FamilySymbol> FindFamilySymbols(Document document, string familyName)
    {
        var symbols = new FilteredElementCollector(document)
            .OfClass(typeof(FamilySymbol))
            .OfType<FamilySymbol>()
            .Where(symbol => symbol.Family is not null)
            .ToList();

        var exact = symbols
            .Where(s => string.Equals(s.Family.Name, familyName, StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (exact.Count > 0)
        {
            return exact;
        }

        return symbols
            .Where(s => s.Family.Name.Contains(familyName, StringComparison.OrdinalIgnoreCase)
                        || string.Equals($"{s.Family.Name} - {s.Name}", familyName, StringComparison.OrdinalIgnoreCase))
            .ToList();
    }

    /// <summary>How close a type's width must be to the tray's to count as its size.</summary>
    private const double WidthMatchToleranceMm = 1.0;

    /// <summary>
    /// Picks the family type built for this tray width.
    ///
    /// A type per width — 100, 200 … 1000 — is the better way to size a hanger
    /// than writing a dimension onto each instance. Choosing a type cannot go
    /// wrong in units, it schedules properly, and the family author decides
    /// what a 600 hanger looks like rather than a parameter being pushed at it.
    ///
    /// Matched first on the type's own width parameter, then on a number in its
    /// name ("SUPPORT HANGING 600"), and failing both the first type is used
    /// and the width written onto the instance as before — so a family with one
    /// type still works.
    /// </summary>
    public static FamilySymbol? PickSymbolForWidth(
        IReadOnlyList<FamilySymbol> symbols,
        double trayWidthMm,
        AddinSettings settings)
    {
        if (symbols.Count == 0)
        {
            return null;
        }

        if (trayWidthMm > 0 && symbols.Count > 1)
        {
            var byParameter = symbols.FirstOrDefault(symbol =>
                ParameterUnits.TryGetMillimetres(symbol.LookupParameter(settings.TrayWidthParameter))
                    is { } width
                && Math.Abs(width - trayWidthMm) <= WidthMatchToleranceMm);

            if (byParameter is not null)
            {
                return byParameter;
            }

            var byName = symbols.FirstOrDefault(symbol => NameStatesWidth(symbol.Name, trayWidthMm));

            if (byName is not null)
            {
                return byName;
            }
        }

        return symbols[0];
    }

    /// <summary>True when a whole number in the type name is this width in mm.</summary>
    private static bool NameStatesWidth(string typeName, double trayWidthMm)
    {
        var wanted = (int)Math.Round(trayWidthMm);

        foreach (var run in typeName.Split(NonDigits, StringSplitOptions.RemoveEmptyEntries))
        {
            if (int.TryParse(run, out var value) && value == wanted)
            {
                return true;
            }
        }

        return false;
    }

    private static readonly char[] NonDigits =
        [' ', '-', '_', 'x', 'X', 'W', 'w', '(', ')', '/', ',', '.', ':', '=', '\t'];

    /// <summary>Resolves the tray id the web app stored (a Revit ElementId).</summary>
    public static Element? FindCableTray(Document document, long cableTrayId) =>
        cableTrayId > 0 ? document.GetElement(new ElementId(cableTrayId)) : null;
}
