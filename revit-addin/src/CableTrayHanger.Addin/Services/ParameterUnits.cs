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
    /// <summary>True when Revit stores this parameter as a length in internal units.</summary>
    private static bool IsLength(Parameter parameter)
    {
        try
        {
            return SpecTypeId.Length.Equals(parameter.Definition.GetDataType());
        }
        catch (Autodesk.Revit.Exceptions.ApplicationException)
        {
            // Some built-in definitions refuse GetDataType. Treating it as a
            // plain number leaves the value untouched, which is the safer miss.
            return false;
        }
    }

    /// <summary>
    /// Writes a millimetre value, converting only if the parameter is a length.
    /// Returns false when there is nothing writable to set.
    /// </summary>
    public static bool TrySetMillimetres(Parameter? parameter, double millimetres)
    {
        if (parameter is null || parameter.IsReadOnly || parameter.StorageType != StorageType.Double)
        {
            return false;
        }

        var value = IsLength(parameter)
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

        return IsLength(parameter)
            ? UnitUtils.ConvertFromInternalUnits(raw, UnitTypeId.Millimeters)
            : raw;
    }
}
