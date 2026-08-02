using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

namespace CableTrayHanger.Addin.Services;

/// <summary>One run's worth of hangers to dimension, in the order they sit along it.</summary>
internal sealed record HangerRun(string TrayName, IReadOnlyList<FamilyInstance> Hangers);

/// <summary>What the dimensioning pass managed, and what it could not.</summary>
internal sealed record DimensionOutcome(int Created, IReadOnlyList<string> Problems);

/// <summary>
/// Draws a continuous dimension along each run of hangers.
///
/// Kept apart from placement, and run in its own transaction after that one has
/// committed, because it is annotation: a dimension that will not draw must not
/// take a correctly placed run of hangers down with it. Everything here reports
/// rather than throws for the same reason.
/// </summary>
internal static class HangerDimensioner
{
    /// <summary>How far to one side of the run the dimension line sits, in millimetres.</summary>
    private const double OffsetMm = 1000.0;

    /// <summary>
    /// Which of a family's own reference planes to dimension to, in the order
    /// they are tried.
    ///
    /// Revit dimensions to references, not to points, and which plane of a
    /// hanger family runs across the tray depends on how the family was drawn —
    /// the same thing the Hanger rotation setting exists for. Rather than ask
    /// for that too, the first type that Revit accepts is used and then reused
    /// for the rest of the run: a reference perpendicular to the dimension line
    /// is exactly what it refuses to draw without.
    /// </summary>
    private static readonly FamilyInstanceReferenceType[] ReferenceTypes =
    [
        FamilyInstanceReferenceType.CenterLeftRight,
        FamilyInstanceReferenceType.CenterFrontBack,
        FamilyInstanceReferenceType.StrongReference,
        FamilyInstanceReferenceType.WeakReference,
    ];

    /// <summary>
    /// The linear dimension styles loaded in this model, for the Settings
    /// dropdown. Named types only — a model carries internal ones with no name
    /// that nobody can pick meaningfully.
    /// </summary>
    public static List<string> LinearStyleNames(Document document)
    {
        try
        {
            return new FilteredElementCollector(document)
                .OfClass(typeof(DimensionType))
                .OfType<DimensionType>()
                .Where(type => type.StyleType == DimensionStyleType.Linear
                               && !string.IsNullOrWhiteSpace(type.Name))
                .Select(type => type.Name)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(name => name, StringComparer.CurrentCultureIgnoreCase)
                .ToList();
        }
        catch (Autodesk.Revit.Exceptions.ApplicationException)
        {
            return [];
        }
    }

    /// <summary>
    /// Dimensions each run. The caller owns the transaction.
    ///
    /// `view` is the one the dimensions are drawn in — dimensions are
    /// view-specific, so there is no such thing as putting them "in the model".
    /// </summary>
    public static DimensionOutcome Annotate(
        Document document,
        View view,
        IReadOnlyCollection<HangerRun> runs,
        AddinSettings settings)
    {
        var problems = new List<string>();

        if (Unsuitable(view) is { } reason)
        {
            return new DimensionOutcome(0, [reason]);
        }

        if (ResolveStyle(document, settings.DimensionTypeName) is not { } style)
        {
            return new DimensionOutcome(0, [
                string.IsNullOrWhiteSpace(settings.DimensionTypeName)
                    ? "This model has no linear dimension style to draw with."
                    : $"No linear dimension style called \"{settings.DimensionTypeName}\" is loaded "
                      + "in this model. Pick one from the dropdown in Settings.",
            ]);
        }

        var created = 0;

        // Found once and then reused: every hanger in a sync is the same family,
        // so the plane that works for the first run works for all of them, and
        // rediscovering it per run means failed NewDimension calls per run.
        FamilyInstanceReferenceType? working = null;

        foreach (var run in runs)
        {
            if (run.Hangers.Count < 2)
            {
                // A dimension needs two things to measure between.
                continue;
            }

            var (drawn, problem, used) = Draw(document, view, run, style, working);

            created += drawn;
            working ??= used;

            if (problem is not null)
            {
                problems.Add($"{run.TrayName}: {problem}");
            }
        }

        return new DimensionOutcome(created, problems);
    }

    /// <summary>Why this view cannot carry dimensions, or null when it can.</summary>
    private static string? Unsuitable(View view)
    {
        if (view.IsTemplate)
        {
            return "The active view is a view template, which cannot hold dimensions.";
        }

        // Revit refuses to dimension in a 3D view whose orientation can still
        // change, and says so with an exception rather than a reason. Saying it
        // here means the fix — Save Orientation and Lock View — is on screen.
        if (view is View3D { IsLocked: false })
        {
            return "The active 3D view is not locked, and Revit only allows dimensions in a locked "
                   + "one. Use Save Orientation and Lock View on the view control bar, or run this "
                   + "from a plan or section view.";
        }

        return null;
    }

    private static DimensionType? ResolveStyle(Document document, string name)
    {
        var linear = new FilteredElementCollector(document)
            .OfClass(typeof(DimensionType))
            .OfType<DimensionType>()
            .Where(type => type.StyleType == DimensionStyleType.Linear
                           && !string.IsNullOrWhiteSpace(type.Name))
            .ToList();

        if (linear.Count == 0)
        {
            return null;
        }

        if (string.IsNullOrWhiteSpace(name))
        {
            // Nothing chosen yet. Any linear style draws a correct dimension,
            // and the office's own style is a click away in Settings.
            return linear[0];
        }

        return linear.FirstOrDefault(type =>
            string.Equals(type.Name, name, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>
    /// Draws one continuous dimension across a run, returning how many were
    /// created, what went wrong, and which reference type worked.
    /// </summary>
    private static (int Created, string? Problem, FamilyInstanceReferenceType? Used) Draw(
        Document document,
        View view,
        HangerRun run,
        DimensionType style,
        FamilyInstanceReferenceType? preferred)
    {
        var points = run.Hangers.Select(Origin).OfType<XYZ>().ToList();

        if (points.Count < 2)
        {
            return (0, "the hangers have no insertion points to measure between.", null);
        }

        if (DimensionLine(points) is not { } line)
        {
            return (0, "every hanger on this run is at the same point, so there is nothing to measure.", null);
        }

        // The preferred type first, then the rest — so the one already known to
        // work is tried once and the others are only reached on a family that
        // disagrees.
        var order = preferred is { } first
            ? new[] { first }.Concat(ReferenceTypes.Where(type => type != first))
            : ReferenceTypes.AsEnumerable();

        string? lastMessage = null;

        foreach (var referenceType in order)
        {
            var references = References(run.Hangers, referenceType);

            if (references.Size < 2)
            {
                continue;
            }

            try
            {
                if (document.Create.NewDimension(view, line, references, style) is not null)
                {
                    return (1, null, referenceType);
                }
            }
            catch (Autodesk.Revit.Exceptions.ApplicationException ex)
            {
                // Revit refuses references that are not parallel planes square
                // to the dimension line. That is a statement about how the
                // family was drawn, so the next reference type is worth a go.
                lastMessage = ex.Message;
            }
        }

        return (
            0,
            "Revit would not dimension to this hanger family — none of its reference planes run "
            + "across the tray"
            + (lastMessage is null ? "." : $" ({lastMessage})."),
            null);
    }

    private static XYZ? Origin(FamilyInstance instance) =>
        (instance.Location as LocationPoint)?.Point;

    /// <summary>
    /// The line the dimension sits on: along the run, offset to one side so it
    /// does not land on top of the tray it describes.
    /// </summary>
    private static Line? DimensionLine(IReadOnlyList<XYZ> points)
    {
        var from = points[0];
        var to = points[^1];
        var along = to - from;

        if (along.IsZeroLength())
        {
            return null;
        }

        var sideways = XYZ.BasisZ.CrossProduct(along);

        // A run going straight up has no side to put a dimension on. Risers are
        // left out of a placement anyway, so this is belt and braces.
        var offset = sideways.IsZeroLength()
            ? XYZ.Zero
            : sideways.Normalize() * UnitUtils.ConvertToInternalUnits(OffsetMm, UnitTypeId.Millimeters);

        try
        {
            return Line.CreateBound(from + offset, to + offset);
        }
        catch (Autodesk.Revit.Exceptions.ApplicationException)
        {
            // Two points closer together than Revit's shortest curve.
            return null;
        }
    }

    private static ReferenceArray References(
        IReadOnlyList<FamilyInstance> hangers,
        FamilyInstanceReferenceType referenceType)
    {
        var references = new ReferenceArray();

        foreach (var hanger in hangers)
        {
            try
            {
                // The first is enough: one plane per hanger is what a chain of
                // dimensions measures between.
                if (hanger.GetReferences(referenceType).FirstOrDefault() is { } reference)
                {
                    references.Append(reference);
                }
            }
            catch (Autodesk.Revit.Exceptions.ApplicationException)
            {
                // A family that does not publish this reference. The rest of
                // the run may still, and a short chain beats none.
            }
        }

        return references;
    }
}
