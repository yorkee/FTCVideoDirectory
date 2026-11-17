# FTC Video Directory

A community-built directory for FIRST Tech Challenge teams, event schedules, match results, and competition videos.

## Frontend

The React + Vite application lives in `ftc-team-directory/`.

```bash
cd ftc-team-directory
npm install
cp .env.example .env.local
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` to connect the live directory. Only a Supabase publishable/anon key belongs in browser configuration. Never put a Supabase secret/service-role key or FIRST API token in frontend environment variables.

## FIRST team match history

The team details modal calls the Supabase Edge Function `get-ftc-team-matches`. The function looks up the team's events for the requested season and retrieves qualification and playoff schedules/results from the FIRST Tech Challenge Events API. FIRST credentials remain server-side.

Deploy the function from the repository root after linking the Supabase project:

```bash
supabase functions deploy get-ftc-team-matches --project-ref YOUR_PROJECT_REF
```

Configure these Edge Function secrets in the Supabase project (the FIRST credentials already used by `sync-ftc-teams` can be reused):

- `FIRST_API_USERNAME`
- `FIRST_API_TOKEN`

The function is configured with `verify_jwt = false` because it is a public, read-only lookup endpoint. It validates team number and season, applies request limits by fetching schedule data event-by-event, and never returns credentials.

The current implementation enables season 2026 (the 2026–27 FTC season). Add a season to the Edge Function allow-list when the directory rolls forward.

FIRST API data is subject to FIRST's terms. This project is independent of FIRST; match/event data is attributed in the team details view. Review the [FIRST API information and terms](https://ftc-events.firstinspires.org/services/API), including restrictions on commercial use, before using the data commercially.
