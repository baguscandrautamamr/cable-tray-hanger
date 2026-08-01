# Cable Tray Hanger — Revit 2025 Add-in (Phase 2)

The Revit half of the system. It reads cable trays out of the active view and
sends them to the web app, then places the hangers the web app calculated.

## Requirements

| | |
|---|---|
| Revit | 2025 (any update) |
| Runtime | .NET 8 — supplied by Revit 2025 |
| Build | .NET 8 SDK, Visual Studio 2022 17.8+ or `dotnet` CLI |

The Revit API assemblies come from NuGet
(`Nice3point.Revit.Api.RevitAPI` / `...RevitAPIUI`, pinned to `2025.0.2`), so
Revit does **not** need to be installed to build. The pin is deliberate: the
2025.1 packages expose APIs that a base 2025.0 install does not have.

## Build

```bash
cd revit-addin
dotnet build CableTrayHanger.sln -c Release
```

Output lands in `src/CableTrayHanger.Addin/bin/Release/`.

Must be built on **Windows** — the ribbon uses WPF image types, which need the
Windows Desktop SDK. That is what `.github/workflows/revit-addin.yml` does on
every push touching `revit-addin/`; download the `CableTrayHanger-Revit2025`
artifact from the run to get a ready-to-copy folder.

## Install

Copy the built files so they end up like this:

```
%APPDATA%\Autodesk\Revit\Addins\2025\
├── CableTrayHanger.addin
└── CableTrayHanger\
    ├── CableTrayHanger.Addin.dll
    ├── CableTrayHanger.Addin.deps.json
    └── CableTrayHanger.Addin.pdb        (optional, for stack traces)
```

The CI artifact is already in that layout — unzip it straight into the `2025`
folder. Restart Revit; a **Cable Tray Hanger** tab appears.

If the DLL came from a download, unblock it first
(`Properties → Unblock`, or `Unblock-File`), or Revit will refuse to load it.

## Configure

Press **Settings** on the ribbon. It opens
`%APPDATA%\CableTrayHanger\settings.json`:

```json
{
  "apiBaseUrl": "https://cable-tray-hanger.vercel.app",
  "apiKey": "",
  "projectName": "HBE-ELECTRICAL-E",
  "hangerFamilyKeyword": "hanger"
}
```

- `apiKey` must equal `ADDIN_API_KEY` in the Vercel environment. Without it
  every call comes back 401.
- `projectName` scopes which configs this model picks up; it has to match the
  project name the web app was configured with.
- `hangerFamilyKeyword` is a case-insensitive substring used to find hanger
  families. Revit has no hanger category and offices name these families their
  own way, so this is how the add-in narrows the list. Blank means "every
  loaded family", which is slow in a large model.

Settings are re-read on every command — no Revit restart needed.

## Use

| Button | What it does |
|---|---|
| **Scan Cable Tray** | Collects the trays, elbows and hanger families visible in the active view and posts them to `/api/scan-cable-tray`. |
| **Sync Hangers** | Fetches the oldest `PENDING` config for the project, places the hangers, and reports back to `/api/config-status/:id`. |
| **Settings** | Opens `settings.json`. |

The whole placement happens in one Revit transaction titled
"Place *N* hangers", so a single undo reverses it. If nothing can be placed the
transaction is rolled back and the config is reported `FAILED` rather than left
half-applied.

## Icons

The ribbon PNGs are generated, not hand-drawn — the shapes live in
`tools/generate_icons.py`:

```bash
python3 tools/generate_icons.py           # rewrite the PNGs
python3 tools/generate_icons.py --check   # CI: fail if they drifted
```

Colours are mid-tones so the artwork survives both the light and dark Revit
2025 themes.

## Known limitations

- **Not yet run inside Revit.** The project compiles clean against the Revit
  2025 reference assemblies, and CI produces the DLL, but nobody has loaded it
  into Revit and clicked the buttons. Treat the first run as a smoke test.
- **The web app discards scans.** `POST /api/scan-cable-tray` validates and
  acknowledges the payload but does not store it, so **Scan** currently has no
  visible effect in the browser — the config form still lists placeholder
  trays. See "Known gaps" in the root README.
- **Elbows are matched to trays by proximity.** A fitting is assigned to the
  nearest tray centreline within 2 ft, and its position is the distance from
  that tray's start. Connector traversal would be exact; this is enough for
  straight runs and avoids guessing which of a fitting's two runs "owns" it.
- **Hangers are placed level-based.** Face-based and work-plane-based hanger
  families will be rejected by Revit; those positions are counted as failures
  and listed in the summary dialog rather than skipped silently.
- **Hangers are not hosted to the tray.** They are placed at the right point in
  space on the tray's reference level, but carry no relationship to the tray,
  so moving the tray later will not move them.
