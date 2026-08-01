using Autodesk.Revit.DB;

namespace CableTrayHanger.Addin.Services;

/// <summary>
/// Reads and writes family parameters in millimetres.
///
/// A hanger family's dimensions are not consistently typed: the one this was
/// written against exposes TRAY_W as a Length (so Revit stores it in internal
/// feet) but "Height Support" as a plain number (stored as typed). Converting
/// unconditionally would put a 500mm drop at 152,400 — or at 1.64 — depending
/// on which way the mistake went, and either lands silently in the model. So
/// the conversion follows what the parameter says it is.
/// </summary>
internal static class ParameterUnits
{
    /// <summary>
    /// True when Revit stores this parameter in internal units rather than as
    /// the number you see.
    ///
    /// Decided by asking for the parameter's unit and seeing whether Revit
    /// refuses — a behaviour, not a comparison. Two earlier attempts compared
    /// the parameter's spec against SpecTypeId.Length instead, and both
    /// answered "not a length" for every parameter in the model: SpecTypeId
    /// hands back a fresh ForgeTypeId on each read, so identity comparison
    /// fails, and the string form is not guaranteed to match either. A Length
    /// then looked unitless, 600mm went in raw, and Revit read it as 600 feet
    /// — a hanger 182.88m wide.
    ///
    /// There is no second oracle for this. Whether a stored double means feet
    /// or means itself is something only the API can say, which is why the
    /// question is put to it directly.
    /// </summary>
    private static bool IsMeasurable(Parameter parameter)
    {
        try
        {
            // Throws for a unitless parameter; returns its display unit
            // otherwise. The unit itself does not matter — internal units are
            // feet regardless of what the project displays.
            return parameter.GetUnitTypeId() is not null;
        }
        catch (Autodesk.Revit.Exceptions.ApplicationException)
        {
            return false;
        }
    }

    /// <summary>
    /// Writes a millimetre value, converting only if the parameter is stored in
    /// internal units. Returns false when there is nothing writable to set.
    /// </summary>
    public static bool TrySetMillimetres(Parameter? parameter, double millimetres)
    {
        if (parameter is null || parameter.IsReadOnly || parameter.StorageType != StorageType.Double)
        {
            return false;
        }

        var value = IsMeasurable(parameter)
            ? UnitUtils.ConvertToInternalUnits(millimetres, UnitTypeId.Millimeters)
            : millimetres;

        return parameter.Set(value);
    }

    /// <summary>Reads a parameter as millimetres, or null when it holds no double.</summary>
    public static double? TryGetMillimetres(Parameter? parameter)
    {
        if (parameter is null || parameter.StorageType != StorageType.Double)
        {
            return null;
        }

        var raw = parameter.AsDouble();

        return IsMeasurable(parameter)
            ? UnitUtils.ConvertFromInternalUnits(raw, UnitTypeId.Millimeters)
            : raw;
    }
}
