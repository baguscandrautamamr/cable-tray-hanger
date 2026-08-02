# Cable Tray Hanger Configuration System — Web App (Phase 1)

React web app that controls placement of hangers on cable trays in Revit.
This is Phase 1 (web control center). The Revit 2025 add-in that syncs with it
(Phase 2) lives in [`revit-addin/`](revit-addin/README.md).

## Stack

React 19 / Vite / TypeScript / Tailwind CSS v4, Supabase (Postgres + Auth),
Vercel serverless functions, lucide-react icons.

## Accounts and access

The whole app sits behind a sign-in. There is no page to see signed out, and no
sign-up form, no magic link and no password reset: **an administrator creates
accounts in the Supabase dashboard** under **Authentication → Users → Add
user**, with an email and a password to hand over. Everything a person can
reach — configs, scans, API keys — is scoped to their own account by row-level
security, so adding somebody is the whole of granting them access and deleting
them is the whole of revoking it.

The sign-in form says as much, so "I do not have an account yet" leads to
asking an administrator rather than hunting for a register link that was never
there.

## Language and theme

The header of every page, the sign-in screen included, carries two toggles:

- **Language** — English and Bahasa Indonesia. Every string is translated;
  English is the fallback for anything a translation is missing. The initial
  choice follows the browser's language, and the toggle overrides it from then
  on.
- **Theme** — light and dark. **Light is the default**, deliberately rather
  than following `prefers-color-scheme`: this is a drawing-office tool used
  beside Revit's own light interface and printed from.

Both are remembered per browser in `localStorage`, and neither needs an
account — somebody who cannot read the sign-in form is exactly the person who
needs the language switch to be in front of it.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project values
npm run dev
```

## Environment variables

There are **two pairs** of Supabase variables and they are not
interchangeable. A deployment needs all four: the `VITE_` pair is compiled into
the browser bundle, the unprefixed pair is read by the serverless functions.
Setting only one pair is the most common way to get this half-working.

| Variable | Where | Value | Symptom if missing |
|---|---|---|---|
| `VITE_SUPABASE_URL` | browser | Supabase project URL | Amber "not configured" banner; login does nothing |
| `VITE_SUPABASE_ANON_KEY` | browser | **anon / public** key | Same |
| `VITE_API_BASE_URL` | browser | Leave **empty** — see below | API calls go to the wrong origin |
| `VITE_PROJECT_NAME` | browser | Placeholder shown before the first scan | Header reads "No project scanned yet" until a scan arrives |
| `SUPABASE_URL` | server | *Same value* as `VITE_SUPABASE_URL` | Every `api/` route 500s |
| `SUPABASE_SERVICE_ROLE_KEY` | server | **service_role** key | Same |
| `ADDIN_API_KEY` | server, optional | Fallback shared secret — see below | Nothing; it is optional |

Two things this trips people on:

- **Never put the service_role key in a `VITE_` variable.** Anything prefixed
  `VITE_` is compiled into the JavaScript bundle and readable by anyone with
  DevTools, and the service role bypasses row-level security entirely. The anon
  key is designed to be public and is the right one for the browser.
- **Adding a variable in Vercel does not change a deployment that already
  exists.** Every deployment captures the environment it was built with, so
  *both* pairs need a redeploy to take effect — the `VITE_` pair because it is
  compiled into the bundle, the server pair because the running deployment
  keeps the snapshot it was created with. Saving the variables and reloading
  the page changes nothing; **Deployments → ⋯ → Redeploy** is the step people
  skip.
- **Leave `VITE_API_BASE_URL` empty.** The app and the functions share an
  origin on Vercel, and an empty value means "same origin". Nothing under
  `api/` sends CORS headers, so setting this to a deployment URL in order to
  develop against it makes the browser block every call. To run the frontend
  locally against a deployed backend, set `DEV_API_PROXY` instead: Vite proxies
  `/api` there, keeping the browser same-origin so CORS never applies.

Set all of them in Vercel under **Settings → Environment Variables**
(Production/Preview/Development scopes), never in a committed file.

`VITE_PROJECT_NAME` no longer has to match the add-in's **Project name**: a
config takes its project from the scan it was built on, so the two are the same
string by construction. The variable only names the project in the header
before any scan has arrived.

`ADDIN_API_KEY` is optional and usually unnecessary. Add-in keys are normally
generated per user in the web app (**API Keys** in the header), which is the
recommended path — they are revocable, attributable, and scoped to the person
who created them. The environment variable exists only for installs with no
account behind them, such as a shared workstation image or a smoke test; it is
not tied to a user and is therefore *not* scoped to one account's configs.

## Database

Run `supabase/schema.sql` in the Supabase SQL editor to create the
`hanger_configs`, `hanger_placement_history`, `addin_api_keys` and
`cable_tray_scans` tables with their RLS policies, constraints and the
`confirm_placement` function. Then
enable email/password auth under **Authentication → Providers**.

For a project already running an earlier schema, apply the migrations in order
instead:

| Migration | What it does |
|---|---|
| `supabase/migrations/0001-hardening.sql` | `TIMESTAMPTZ` columns, status/spacing constraints, `updated_at` trigger, `confirm_placement` |
| `supabase/migrations/0002-addin-api-keys.sql` | `addin_api_keys` table for keys generated in the web app |
| `supabase/migrations/0003-cable-tray-scans.sql` | `cable_tray_scans` table, so the add-in's scan reaches the config form |
| `supabase/migrations/0004-whole-scan-configs.sql` | a config covers every tray in a scan, and carries the hanger height |
| `supabase/migrations/0005-scan-family-keyword.sql` | records the family keyword, so an empty dropdown can be explained |

## Commands

```bash
npm run dev            # local dev server
npm run build          # production build (tsc -b && vite build)
npm run lint           # oxlint
npm run test           # vitest (placement algorithm)
npm run typecheck:api  # typecheck the serverless functions
npm run preview        # preview production build locally
```

## API endpoints (Vercel functions, under `api/`)

Every endpoint runs with the Supabase service role key, which bypasses RLS, so
all of them authenticate. The add-in endpoints take a shared secret; the one
endpoint the browser calls takes the user's Supabase session token.

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/health` | none | Reports what is configured — see Troubleshooting |
| `POST /api/scan-cable-tray` | `x-api-key` | Store a scan from the Revit add-in |
| `GET /api/latest-scan` | `Authorization: Bearer <supabase access token>` | Newest scan for this user, read by the config form |
| `POST /api/hanger-config` | `Authorization: Bearer <supabase access token>` | Save a config and calculate hanger placement |
| `GET /api/latest-config` | `x-api-key` | Add-in polls this for a pending config |
| `PATCH /api/config-status/:id` | `x-api-key` | Add-in confirms placement after sync |
| `GET/POST/DELETE /api/addin-keys` | `Authorization: Bearer <supabase access token>` | List, create and revoke add-in keys |

`POST /api/hanger-config` sets the config's owner from the verified token, so
the request body carries no user id. `PATCH /api/config-status/:id` accepts a
`status` of `SYNCED` or `FAILED` only.

An `x-api-key` belongs to the account that generated it, so `latest-config` and
`config-status` only see that account's configs. The secret is stored as a
SHA-256 hash and shown exactly once, at creation.

## Troubleshooting

**`{"error":{"code":"500","message":"A server error has occurred"}}`**, often
with `FUNCTION_INVOCATION_FAILED` — that is Vercel's own error, not ours, and it
means the function crashed before running. Two causes, and they are told apart
by *how many* endpoints are affected.

*Every* endpoint failing, `/api/health` included, is not an environment
problem — a missing variable is reported properly by the handler, and
`/api/health` needs no variables at all. It means the function crashed at
import. The usual cause is a relative import without a file extension:
`package.json` sets `"type": "module"`, so Node's ESM resolver rejects
`from "./_lib/auth"` and wants `from "./_lib/auth.js"`. `npm run typecheck:api`
catches this — `tsconfig.api.json` resolves modules the way Node does, not the
way a bundler does, precisely so that it does.

*One* endpoint failing is worth reading the Functions log for. Otherwise, ask
the deployment what it is missing:

```bash
curl https://<your-deployment>/api/health
```

It answers 200 when healthy and 503 when not, with the same body either way,
and a `hints` array saying what to fix. Add `-H "x-api-key: <key>"` and it also
reports whether that key is accepted. The add-in's **Settings → Test
connection** button calls exactly this.

The response contains only booleans — never a value, a URL or a key.

## The Revit → web → Revit loop

1. **Scan Cable Tray** in Revit asks you to select cable trays and their
   fittings and click **Finish** — or uses whatever is already selected. Those
   elements are posted to `POST /api/scan-cable-tray`, which stores them
   against the account that owns the API key. Each tray carries its **width**
   and how many hangers are already on it.

   Selecting beats sweeping the active view: a 3D view shows every run in the
   model, including other levels and runs already done, with no way to say
   "these ones". Fittings are reported alongside the trays, but they no longer
   earn a hanger of their own: the spacing entered on the form is the whole
   rule, and a bend gets a hanger only where that spacing puts one.
2. The config form reads the newest scan from `GET /api/latest-scan`. There is
   no tray to pick: a config covers **every empty** tray in the scan, because a
   run needs hangers along all of it and choosing them one at a time was the
   slow part of the job. Trays that already carry hangers are listed and then
   left out — see below.
3. You choose three things — hanger family, spacing, and height. Everything
   else is taken from the model.
4. **Sync Hangers** places the lot in one transaction and reports back.

The project name travels with the scan, so the web app adopts whatever the
add-in scanned under. `VITE_PROJECT_NAME` is only a placeholder shown before
the first scan arrives — the two can no longer drift apart.

### Width, height, and revisions

**Width is never typed in.** The hanger has to span the tray, so the add-in
sizes it from the tray's own width. One config serves runs of different widths.

The steady way to do that is **a family type per width** — 100, 200 … 1000.
Choosing a type cannot go wrong in units, it schedules properly, and the family
author decides what a 600 hanger looks like rather than having a number pushed
at it. The add-in matches a type by its own width parameter, or failing that by
a number in the type name (`SUPPORT HANGING 600`). A family with a single type
still works: the width is written onto each instance instead, and the Sync
dialog says so.

**Orientation.** Each hanger is turned to the heading of its tray, plus the
**Hanger rotation** in Settings — 90° for a family drawn across the tray, 0°
for one drawn along it. Nothing in the model says which you have, so if they
come out facing the wrong way, that is the one number to change.

**Height is the one dimension the model cannot supply**, so the web app asks
for it — and it is written *only* onto hangers the add-in creates.

### A tray that already has hangers is never touched again

This is the rule the revision loop turns on, and it is enforced in three
places rather than one, because the first two can go out of date:

1. **At scan time.** Every hanger in the model is matched to the tray it stands
   on, and a tray carrying any of them is reported with its count and the
   height they share. The search covers the **whole document**, not the active
   view — a hanger hidden by a view filter or cropped out by a section box is
   still standing on the tray, and scoping the search to a view made duplicate
   hangers depend on what happened to be visible when somebody pressed Scan.
   The match is generous vertically, so a family whose insertion point sits at
   the top of a long drop rod is still recognised, and in plan it allows the
   tray's own half-width plus a margin, because a hanger straddles its tray and
   the family's origin is as likely to be at a drop rod as at the centre.
2. **At config time.** `POST /api/hanger-config` leaves those trays out of the
   configuration entirely, and the form says which ones and why. A scan where
   every tray is hung is rejected with "nothing left to place" rather than
   saved as an empty config.
3. **At sync time**, which is the one that actually holds. A scan is a
   snapshot; hangers appear between taking one and syncing it — placed by hand,
   by an earlier sync of the same config, or by somebody else in a workshared
   model. So **Sync Hangers** asks the model again at the moment of placement:
   a tray with hangers on it is skipped whole, and any remaining position that
   lands on an existing hanger is dropped rather than doubled up. Existing
   hangers are also never *moved* — the bend-clearance nudge applies only to
   hangers this sync created.

   Crucially, sync recognises them **by the family it is about to place**, not
   by the keyword. An instance of that exact family is a hanger by definition
   and no dialog setting can be wrong about it. The keyword is a supplement,
   catching hangers of some *other* family on the same run.

Steps 1 and 2 depend on the keyword, and step 3 does not — which matters,
because a keyword that matches nothing is invisible from the web app. The
family dropdown falls back to listing every cable tray fitting and looks
perfectly normal, while the "already has hangers" count reads zero for every
tray. The **Scan Cable Tray** dialog therefore reports how many trays it found
already hung, and names the keyword when that number is zero — the one figure
worth checking against what is on screen. Get the keyword wrong and you will
be told the trays are empty and then get fewer hangers than the web app
promised; you will not get duplicates.

So a hanger already in the model is never created over, never moved and never
written to, and a height you revised in Revit survives every later push. To
re-hang a run, delete its hangers first, then scan and push again — the Sync
dialog says exactly that alongside the trays it left alone.

Both parameter names (`TRAY_W` and `Height Support` by default) are settings in
the add-in's dialog, because every office's hanger family names them
differently. Blank switches that write off.

### Finding the hanger family

Revit has no hanger category. A cable tray hanger is built as a **Cable Tray
Fitting**, so that is what the dropdown lists — every other loadable family in
the project is irrelevant, and listing them buried the one entry anybody wanted
under hundreds of doors and pipe fittings.

Within that category the **Hanger family keyword** narrows further (`hang` by
default, which matches Hanger, Hangers and HANGING alike). A keyword that
matches nothing does **not** empty the dropdown: the add-in sends every cable
tray fitting family instead and flags that it did, and the web app names the
keyword that failed. Only a real keyword match is used to recognise hangers
already in the model — falling back there would class every elbow as a hanger.

## Deploy

Connect the GitHub repo to Vercel (zero-config). Set the server env vars
above, then deploy. `vercel.json` rewrites all non-`/api` routes to
`index.html` for client-side routing.
