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

Set the two `SUPABASE_*` server variables in Vercel under
**Settings → Environment Variables** (Production/Preview/Development scopes),
not in a committed file.

## Database

Run `supabase/schema.sql` in the Supabase SQL editor to create the
`hanger_configs` and `hanger_placement_history` tables with RLS policies.
Then enable email/password auth under **Authentication → Providers**.

## Commands

```bash
npm run dev       # local dev server
npm run build     # production build (tsc -b && vite build)
npm run lint      # oxlint
npm run preview   # preview production build locally
```

## API endpoints (Vercel functions, under `api/`)

- `POST /api/scan-cable-tray` — receive scan data from the Revit add-in
- `POST /api/hanger-config` — save a config and calculate hanger placement
- `GET /api/latest-config` — add-in polls this for a pending config
- `PATCH /api/config-status/:id` — add-in confirms placement after sync

## Deploy

Connect the GitHub repo to Vercel (zero-config). Set the server env vars
above, then deploy. `vercel.json` rewrites all non-`/api` routes to
`index.html` for client-side routing.
