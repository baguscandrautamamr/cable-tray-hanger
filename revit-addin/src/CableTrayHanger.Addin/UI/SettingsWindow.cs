using System;
using System.Collections.Generic;
using System.Globalization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;
using CableTrayHanger.Addin.Model;
using CableTrayHanger.Addin.Services;

namespace CableTrayHanger.Addin.UI;

/// <summary>
/// Editor for the add-in's connection settings.
///
/// Built in code rather than XAML on purpose: no XAML means no markup
/// compilation step, so the project builds on a non-Windows CI agent as well as
/// in Visual Studio, and the whole dialog is one reviewable file.
/// </summary>
internal sealed class SettingsWindow : Window
{
    private static readonly Thickness FieldMargin = new(0, 0, 0, 12);

    private readonly AddinSettings _settings;

    private readonly TextBox _baseUrl = new();
    private readonly PasswordBox _apiKeyMasked = new();
    private readonly TextBox _apiKeyPlain = new() { Visibility = Visibility.Collapsed };
    private readonly CheckBox _revealKey = new() { Content = "Show", VerticalAlignment = VerticalAlignment.Center };
    private readonly TextBox _projectName = new();
    private readonly TextBox _keyword = new();
    private readonly TextBox _widthParameter = new();
    private readonly TextBox _heightParameter = new();
    private readonly TextBox _rotation = new();
    private readonly TextBlock _status = new() { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 4, 0, 0) };
    private readonly Button _testButton = new() { Content = "Test connection", Padding = new Thickness(12, 4, 12, 4) };
    private readonly Button _saveButton = new() { Content = "Save", Padding = new Thickness(20, 4, 20, 4), IsDefault = true };

    public SettingsWindow(AddinSettings settings)
    {
        _settings = settings;

        Title = "Cable Tray Hanger — Settings";
        Width = 560;
        SizeToContent = SizeToContent.Height;
        ResizeMode = ResizeMode.NoResize;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ShowInTaskbar = false;

        _baseUrl.Text = settings.ApiBaseUrl;
        _apiKeyMasked.Password = settings.ApiKey;
        _apiKeyPlain.Text = settings.ApiKey;
        _projectName.Text = settings.ProjectName;
        _keyword.Text = settings.HangerFamilyKeyword;
        _widthParameter.Text = settings.TrayWidthParameter;
        _heightParameter.Text = settings.HangerHeightParameter;
        _rotation.Text = settings.HangerRotationDegrees.ToString(CultureInfo.CurrentCulture);

        // Keep the two key editors in step so either can be the source of truth.
        _apiKeyMasked.PasswordChanged += (_, _) =>
        {
            if (_apiKeyPlain.Text != _apiKeyMasked.Password) _apiKeyPlain.Text = _apiKeyMasked.Password;
        };
        _apiKeyPlain.TextChanged += (_, _) =>
        {
            if (_apiKeyMasked.Password != _apiKeyPlain.Text) _apiKeyMasked.Password = _apiKeyPlain.Text;
        };
        _revealKey.Checked += (_, _) => SetKeyRevealed(true);
        _revealKey.Unchecked += (_, _) => SetKeyRevealed(false);

        _testButton.Click += OnTestConnection;
        _saveButton.Click += OnSave;

        Content = BuildLayout();
    }

    /// <summary>Parents the dialog to Revit so it is modal over the main window.</summary>
    public void ShowDialogOver(IntPtr revitMainWindow)
    {
        if (revitMainWindow != IntPtr.Zero)
        {
            new WindowInteropHelper(this).Owner = revitMainWindow;
        }

        ShowDialog();
    }

    private UIElement BuildLayout()
    {
        var root = new StackPanel { Margin = new Thickness(20) };

        root.Children.Add(new TextBlock
        {
            Text = "These settings are stored per Windows user, outside the Revit model.",
            TextWrapping = TextWrapping.Wrap,
            Foreground = Brushes.Gray,
            Margin = new Thickness(0, 0, 0, 16),
        });

        root.Children.Add(Labelled(
            "API base URL",
            _baseUrl,
            "Where the web app is deployed, e.g. https://cable-tray-hanger.vercel.app"));

        var keyRow = new DockPanel();
        DockPanel.SetDock(_revealKey, Dock.Right);
        _revealKey.Margin = new Thickness(8, 0, 0, 0);
        keyRow.Children.Add(_revealKey);

        var keyEditors = new Grid();
        keyEditors.Children.Add(_apiKeyMasked);
        keyEditors.Children.Add(_apiKeyPlain);
        keyRow.Children.Add(keyEditors);

        root.Children.Add(Labelled(
            "API key",
            keyRow,
            "Generate one in the web app under API Keys, then paste it here."));

        root.Children.Add(Labelled(
            "Project name",
            _projectName,
            "Must match the project the configs were pushed for."));

        root.Children.Add(Labelled(
            "Hanger family keyword",
            _keyword,
            "Case-insensitive part of the family name. Revit has no hanger category, "
            + "so this is how the add-in narrows the list, and how it tells hangers already "
            + "in the model apart from elbows. Blank means every loaded family."));

        root.Children.Add(Labelled(
            "Tray width parameter",
            _widthParameter,
            "Instance parameter on the hanger that holds the tray width, e.g. TRAY_W. Each "
            + "tray's own width is written into it. Blank to leave the family's own value."));

        root.Children.Add(Labelled(
            "Hanger height parameter",
            _heightParameter,
            "Instance parameter holding the drop height, e.g. \"Height Support\". Set only on "
            + "hangers this add-in creates, so a height revised in Revit is never overwritten."));

        root.Children.Add(Labelled(
            "Hanger rotation (degrees)",
            _rotation,
            "Turn applied after aligning the hanger with the run. A family drawn across the tray "
            + "needs 90 where one drawn along it needs 0. If the hangers face the wrong way, "
            + "change this."));

        var buttons = new DockPanel { Margin = new Thickness(0, 8, 0, 0) };
        DockPanel.SetDock(_testButton, Dock.Left);
        buttons.Children.Add(_testButton);

        var cancel = new Button
        {
            Content = "Cancel",
            Padding = new Thickness(16, 4, 16, 4),
            IsCancel = true,
            Margin = new Thickness(8, 0, 0, 0),
        };

        var right = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
        right.Children.Add(_saveButton);
        right.Children.Add(cancel);
        buttons.Children.Add(right);

        root.Children.Add(buttons);
        root.Children.Add(_status);

        return root;
    }

    private static UIElement Labelled(string label, UIElement editor, string hint)
    {
        var panel = new StackPanel { Margin = FieldMargin };

        panel.Children.Add(new TextBlock { Text = label, FontWeight = FontWeights.SemiBold });
        panel.Children.Add(editor);
        panel.Children.Add(new TextBlock
        {
            Text = hint,
            TextWrapping = TextWrapping.Wrap,
            Foreground = Brushes.Gray,
            FontSize = 11,
            Margin = new Thickness(0, 2, 0, 0),
        });

        return panel;
    }

    private void SetKeyRevealed(bool revealed)
    {
        _apiKeyPlain.Visibility = revealed ? Visibility.Visible : Visibility.Collapsed;
        _apiKeyMasked.Visibility = revealed ? Visibility.Collapsed : Visibility.Visible;
    }

    private string CurrentKey => _apiKeyPlain.Text;

    private async void OnTestConnection(object sender, RoutedEventArgs e)
    {
        _testButton.IsEnabled = false;
        Report("Contacting the server...", Brushes.Gray);

        try
        {
            var health = await HangerApiClient
                .CheckHealthAsync(_baseUrl.Text.Trim(), CurrentKey.Trim())
                .ConfigureAwait(true);

            var (text, brush) = Summarise(health, keyEntered: !string.IsNullOrWhiteSpace(CurrentKey));
            Report(text, brush);
        }
        catch (ApiException ex)
        {
            Report(ex.Message, Brushes.Firebrick);
        }
        finally
        {
            _testButton.IsEnabled = true;
        }
    }

    /// <summary>Turns the health report into one actionable sentence.</summary>
    private static (string Text, Brush Brush) Summarise(HealthDto health, bool keyEntered)
    {
        var problems = new List<string>(health.Hints);

        if (!health.Ok)
        {
            return (
                "The server is reachable but not ready:\n  • " + string.Join("\n  • ", Fallback(problems)),
                Brushes.Firebrick);
        }

        if (!keyEntered)
        {
            return ("Server is healthy. Paste an API key to check it too.", Brushes.DarkGoldenrod);
        }

        if (!health.ApiKey.Valid)
        {
            return (
                "Server is healthy, but that API key was rejected. Generate a new one in the "
                + "web app under API Keys.",
                Brushes.Firebrick);
        }

        var label = string.IsNullOrWhiteSpace(health.ApiKey.Label) ? "" : $" (\"{health.ApiKey.Label}\")";
        return ($"Connected. API key accepted{label}.", Brushes.SeaGreen);
    }

    private static List<string> Fallback(List<string> hints) =>
        hints.Count > 0 ? hints : ["The server did not say what is wrong. Check the Vercel logs."];

    private void Report(string text, Brush brush)
    {
        _status.Text = text;
        _status.Foreground = brush;
    }

    private void OnSave(object sender, RoutedEventArgs e)
    {
        var baseUrl = _baseUrl.Text.Trim();

        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            Report("The API base URL must be a full http(s) address.", Brushes.Firebrick);
            return;
        }

        if (string.IsNullOrWhiteSpace(_projectName.Text))
        {
            Report("Project name cannot be empty — it selects which configs this model syncs.", Brushes.Firebrick);
            return;
        }

        _settings.ApiBaseUrl = baseUrl;
        _settings.ApiKey = CurrentKey.Trim();
        _settings.ProjectName = _projectName.Text.Trim();
        _settings.HangerFamilyKeyword = _keyword.Text.Trim();
        _settings.TrayWidthParameter = _widthParameter.Text.Trim();
        _settings.HangerHeightParameter = _heightParameter.Text.Trim();

        if (!double.TryParse(_rotation.Text.Trim(), NumberStyles.Float, CultureInfo.CurrentCulture, out var degrees))
        {
            Report("Hanger rotation must be a number of degrees, e.g. 0 or 90.", Brushes.Firebrick);
            return;
        }

        _settings.HangerRotationDegrees = degrees;

        try
        {
            _settings.Save();
        }
        catch (Exception ex) when (ex is System.IO.IOException or UnauthorizedAccessException)
        {
            Report($"Could not write the settings file: {ex.Message}", Brushes.Firebrick);
            return;
        }

        DialogResult = true;
    }
}
