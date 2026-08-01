using System;
using System.Linq;
using System.Reflection;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Autodesk.Revit.UI;

namespace CableTrayHanger.Addin;

/// <summary>Builds the ribbon. Entry point named by CableTrayHanger.addin.</summary>
public sealed class CableTrayHangerApplication : IExternalApplication
{
    private const string TabName = "Cable Tray Hanger";
    private const string PanelName = "Hangers";

    private static readonly string AssemblyPath = Assembly.GetExecutingAssembly().Location;

    public Result OnStartup(UIControlledApplication application)
    {
        try
        {
            CreateRibbon(application);
            return Result.Succeeded;
        }
        catch (Exception ex)
        {
            // Throwing here makes Revit disable the add-in with a generic
            // message. Report the real reason and keep Revit usable.
            TaskDialog.Show("Cable Tray Hanger", $"The ribbon could not be created:\n\n{ex.Message}");
            return Result.Failed;
        }
    }

    public Result OnShutdown(UIControlledApplication application) => Result.Succeeded;

    private static void CreateRibbon(UIControlledApplication application)
    {
        try
        {
            application.CreateRibbonTab(TabName);
        }
        catch (Autodesk.Revit.Exceptions.ArgumentException)
        {
            // Already created — by a reload, or by another add-in sharing the tab.
        }

        var panel = application.GetRibbonPanels(TabName)
                        .FirstOrDefault(p => p.Name == PanelName)
                    ?? application.CreateRibbonPanel(TabName, PanelName);

        panel.AddItem(CreateButton(
            "ScanCableTray",
            "Scan\nCable Tray",
            "CableTrayHanger.Addin.Commands.ScanCommand",
            "Scan the active view",
            "Collects the cable trays, elbows and hanger families in the active view and sends them to the "
            + "web app, where the placement is configured."));

        panel.AddItem(CreateButton(
            "SyncHangers",
            "Sync\nHangers",
            "CableTrayHanger.Addin.Commands.SyncCommand",
            "Place the pending configuration",
            "Fetches the oldest pending configuration for this project and places the hangers it specifies, "
            + "then reports the outcome back to the web app."));

        panel.AddSeparator();

        panel.AddItem(CreateButton(
            "Settings",
            "Settings",
            "CableTrayHanger.Addin.Commands.SettingsCommand",
            "Configure the connection",
            "Opens settings.json, which holds the API base URL, the API key and the project name."));
    }

    private static PushButtonData CreateButton(
        string iconName,
        string text,
        string className,
        string tooltip,
        string longDescription)
    {
        var data = new PushButtonData(iconName, text, AssemblyPath, className)
        {
            ToolTip = tooltip,
            LongDescription = longDescription,
            Image = LoadIcon($"{iconName}16"),
            LargeImage = LoadIcon($"{iconName}32"),
        };

        return data;
    }

    /// <summary>
    /// Loads a PNG embedded by the csproj. Returns null when missing so a
    /// renamed resource costs an icon rather than the whole ribbon.
    /// </summary>
    private static ImageSource? LoadIcon(string name)
    {
        var resource = $"CableTrayHanger.Addin.Resources.Icons.{name}.png";
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(resource);

        if (stream is null)
        {
            return null;
        }

        var decoder = new PngBitmapDecoder(stream, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnLoad);
        var frame = decoder.Frames[0];
        frame.Freeze();
        return frame;
    }
}
