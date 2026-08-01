# Cable Tray Hanger Configuration System — Web App (Phase 1)

React web app that controls placement of hangers on cable trays in Revit.
This is Phase 1 (web control center). The Revit 2025 add-in that syncs with it
(Phase 2) lives in [`revit-addin/`](revit-addin/README.md).

## Stack

React 19 / Vite / TypeScript / Tailwind CSS v4, Supabase (Postgres + Auth),
Vercel serverless functions, lucide-react icons.

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
| `VITE_PROJECT_NAME` | browser | Default Revit project name shown in the UI | Falls back to `HBE-ELECTRICAL-E`, which the add-in probably is not polling for |
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

`VITE_PROJECT_NAME` has to match the **Project name** field in the add-in's
Settings dialog exactly. The web app stamps that string onto every config it
pushes and the add-in polls for its own string, so a mismatch is silent: the
web app reports success and **Sync Hangers** keeps answering "No pending
configuration".

`ADDIN_API_KEY` is optional and usually unnecessary. Add-in keys are normally
generated per user in the web app (**API Keys** in the header), which is the
recommended path — they are revocable, attributable, and scoped to the person
who created them. The environment variable exists only for installs with no
account behind them, such as a shared workstation image or a smoke test; it is
not tied to a user and is therefore *not* scoped to one account's configs.

## Database

Run `supabase/schema.sql` in the Supabase SQL editor to create the
`hanger_configs`, `hanger_placement_history` and `addin_api_keys` tables with
their RLS policies, constraints and the `confirm_placement` function. Then
enable email/password auth under **Authentication → Providers**.

For a project already running an earlier schema, apply the migrations in order
instead:

| Migration | What it does |
|---|---|
| `supabase/migrations/0001-hardening.sql` | `TIMESTAMPTZ` columns, status/spacing constraints, `updated_at` trigger, `confirm_placement` |
| `supabase/migrations/0002-addin-api-keys.sql` | `addin_api_keys` table for keys generated in the web app |

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
| `POST /api/scan-cable-tray` | `x-api-key` | Receive scan data from the Revit add-in |
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

## Known gaps

`POST /api/scan-cable-tray` validates and acknowledges the add-in's payload but
does not store it, so the config form still lists the placeholder trays and
hanger families in `src/components/HangerConfigForm.tsx`. Closing the
Revit → web loop needs a table for scan results, a read endpoint for the
frontend, and the form switched over from those constants. Until then the
add-in's **Scan Cable Tray** button has no visible effect in the browser.

## Deploy

Connect the GitHub repo to Vercel (zero-config). Set the server env vars
above, then deploy. `vercel.json` rewrites all non-`/api` routes to
`index.html` for client-side routing.
