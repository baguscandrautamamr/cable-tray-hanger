# Cable Tray Hanger Configuration System — Web App (Phase 1)

React web app that controls placement of hangers on cable trays in Revit.
This is Phase 1 (web control center); a C# Revit add-in (Phase 2) syncs with it.

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
| `ADDIN_API_KEY` | Vercel (server) | Shared secret the Revit add-in sends as `x-api-key` |

Set the server variables in Vercel under **Settings → Environment Variables**
(Production/Preview/Development scopes), not in a committed file. Generate the
add-in key with `openssl rand -hex 32`; without it the add-in endpoints refuse
every request.

## Database

Run `supabase/schema.sql` in the Supabase SQL editor to create the
`hanger_configs` and `hanger_placement_history` tables with their RLS policies,
constraints and the `confirm_placement` function. Then enable email/password
auth under **Authentication → Providers**.

For a project already running the original schema, apply
`supabase/migrations/0001-hardening.sql` instead — it converts the timestamp
columns to `TIMESTAMPTZ`, adds the status/spacing constraints, and installs the
`updated_at` trigger and `confirm_placement`.

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
| `POST /api/scan-cable-tray` | `x-api-key` | Receive scan data from the Revit add-in |
| `POST /api/hanger-config` | `Authorization: Bearer <supabase access token>` | Save a config and calculate hanger placement |
| `GET /api/latest-config` | `x-api-key` | Add-in polls this for a pending config |
| `PATCH /api/config-status/:id` | `x-api-key` | Add-in confirms placement after sync |

`POST /api/hanger-config` sets the config's owner from the verified token, so
the request body carries no user id. `PATCH /api/config-status/:id` accepts a
`status` of `SYNCED` or `FAILED` only.

## Known gaps

`POST /api/scan-cable-tray` validates and acknowledges the add-in's payload but
does not store it, so the config form still lists the placeholder trays and
hanger families in `src/components/HangerConfigForm.tsx`. Closing the
Revit → web loop needs a table for scan results, a read endpoint for the
frontend, and the form switched over from those constants.

## Deploy

Connect the GitHub repo to Vercel (zero-config). Set the server env vars
above, then deploy. `vercel.json` rewrites all non-`/api` routes to
`index.html` for client-side routing.
