# Cable Tray Hanger — Revit 2025 Add-in (Phase 2)

The Revit half of the system. It reads the cable trays you select and sends
them to the web app, then places the hangers the web app calculated — on the
trays that do not already have any.

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

**First, get a key.** In the web app, sign in and open **API Keys** in the
header. Generate one, name it after the machine, and copy it — it is shown
once and stored only as a hash, so it cannot be recovered later. Keys are
revocable and scoped to your account.

**Then, in Revit**, press **Settings** on the ribbon:

| Field | Meaning |
|---|---|
| API base URL | Where the web app is deployed |
| API key | The key you just generated |
| Project name | Which project's configs this model syncs with — must match the web app |
| Hanger family keyword | Case-insensitive part of the family name used to find hangers |

**Test connection** calls `GET /api/health` and reports, in one sentence,
whether the server is reachable, whether it is configured, and whether the key
is accepted — so a bad setting is diagnosed before you try to sync.

The keyword field exists because Revit has no hanger category and offices name
these families their own way. Blank means "every loaded family", which is slow
in a large model.

Values are written to `%APPDATA%\CableTrayHanger\settings.json`, so an IT
deployment can push that file to a machine instead of having someone fill in
the form. Settings are re-read on every command — no Revit restart needed.

## Use

| Button | What it does |
|---|---|
| **Scan Cable Tray** | Collects the trays and fittings you select, plus the project's hanger families, and posts them to `/api/scan-cable-tray`. Hangers already in the model are found across the whole document and reported per tray. |
| **Sync Hangers** | Fetches the oldest `PENDING` config for the project, places the hangers on the trays that have none, and reports back to `/api/config-status/:id`. |
| **Settings** | Connection settings, with a Test connection button. |

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

- **Only partly exercised inside Revit.** Sync has been run against a real
  model; the ribbon, the icons and the failure dialogs work. The settings
  dialog and the key-based auth have been compiled and reviewed but not yet
  clicked through in Revit.
- **Elbows are reported, not acted on.** A fitting is assigned to the nearest
  tray centreline within 2 ft and its position recorded as the distance from
  that tray's start, so the web app can say how many bends a scan covered.
  Nothing places a hanger from it.
- **Spacing is the only rule.** Hangers go at the two ends of each tray and at
  the spacing entered on the web page. A bend earns one only if the spacing puts
  it there.
- **A tray that already has hangers is skipped, and its hangers are never
  touched.** Sync asks the model what is standing on each tray at the moment of
  placement rather than trusting the scan, because a scan goes out of date the
  moment somebody places a hanger by hand. A tray carrying any hanger is skipped
  whole, and a position that lands on an existing hanger is dropped rather than
  doubled up. Existing hangers are also exempt from the joint nudge below — they
  are never moved and never written to, so a height revised in Revit survives.
  The summary dialog names the trays it left alone. To re-hang one, delete its
  hangers first.
- **Hangers that meet at a joint are stepped apart.** Two runs meeting at a bend
  each want a hanger at the point they share. Both slide along their own tray,
  away from each other, until they clear — by the trays' own widths, since a
  hanger straddles its tray, and never by less than 300mm. Only the add-in can
  do this: the payload carries offsets along a tray, not coordinates, so nothing
  in it says two trays touch. The summary dialog says how many pairs moved.
- **Hangers are placed level-based.** Face-based and work-plane-based hanger
  families will be rejected by Revit; those positions are counted as failures
  and listed in the summary dialog rather than skipped silently.
- **Hangers are not hosted to the tray.** They are placed at the right point in
  space on the tray's reference level, but carry no relationship to the tray,
  so moving the tray later will not move them.
