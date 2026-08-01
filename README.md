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

| Variable | Where | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | frontend | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | frontend | Supabase anon/public key |
| `VITE_API_BASE_URL` | frontend | Base URL of the deployed backend |
| `VITE_PROJECT_NAME` | frontend | Default Revit project name shown in UI |
| `SUPABASE_URL` | Vercel (server) | Same Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (server) | Service role key — never expose to the client |
| `ADDIN_API_KEY` | Vercel (server), optional | Fallback shared secret — see below |

The two `SUPABASE_*` variables are **required**. Set them in Vercel under
**Settings → Environment Variables** (Production/Preview/Development scopes),
not in a committed file. Without them every `api/` route fails.

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

**`{"error":{"code":"500","message":"A server error has occurred"}}`** — that is
Vercel's own error, not ours, and it means the function crashed before running.
Almost always a missing environment variable.

Ask the deployment what it is missing:

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
