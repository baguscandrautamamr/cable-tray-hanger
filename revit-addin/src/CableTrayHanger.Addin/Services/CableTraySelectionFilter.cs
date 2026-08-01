using Autodesk.Revit.DB;
using Autodesk.Revit.UI.Selection;

namespace CableTrayHanger.Addin.Services;

/// <summary>
/// Restricts picking to cable trays and cable tray fittings.
///
/// Fittings are wanted alongside the trays for two reasons: an elbow is what
/// forces a hanger at a direction change, and a hanger already in the model is
/// itself a cable tray fitting, which is how the scan knows to leave that run
/// alone.
/// </summary>
internal sealed class CableTraySelectionFilter : ISelectionFilter
{
    public bool AllowElement(Element element)
    {
        var category = element.Category?.Id.Value;

        return category == (long)BuiltInCategory.OST_CableTray
               || category == (long)BuiltInCategory.OST_CableTrayFitting;
    }

    /// <summary>Whole elements only; there is nothing to pick a face or edge for.</summary>
    public bool AllowReference(Reference reference, XYZ position) => false;
}
