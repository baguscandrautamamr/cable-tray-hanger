using System;
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
    /// True when Revit stores this parameter as a length in internal units.
    ///
    /// Compared as strings, not with Equals: SpecTypeId.Length hands back a
    /// fresh ForgeTypeId each time it is read, and comparing those the obvious
    /// way answered false for every parameter. A Length then looked unitless,
    /// so 600mm was written raw and read back as 600 *feet* — a hanger 182.88m
    /// wide, which is what it takes for a wrong answer here to be visible.
    ///
    /// The version suffix is dropped before comparing, so a family authored
    /// against a different schema revision still matches.
    /// </summary>
    private static bool IsLength(Parameter parameter)
    {
        try
        {
            var actual = parameter.Definition?.GetDataType()?.TypeId;

            return actual is not null
                   && string.Equals(
                       WithoutVersion(actual),
                       WithoutVersion(SpecTypeId.Length.TypeId),
                       StringComparison.Ordinal);
        }
        catch (Autodesk.Revit.Exceptions.ApplicationException)
        {
            // Some built-in definitions refuse GetDataType. Treating it as a
            // plain number leaves the value untouched, which is the safer miss.
            return false;
        }
    }

    /// <summary>"autodesk.spec.aec:length-2.0.0" -> "autodesk.spec.aec:length".</summary>
    private static string WithoutVersion(string typeId)
    {
        var dash = typeId.LastIndexOf('-');
        return dash < 0 ? typeId : typeId.Substring(0, dash);
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
