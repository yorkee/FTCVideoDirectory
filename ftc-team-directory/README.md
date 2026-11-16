# FTC Team Directory frontend

Responsive React + Vite + TypeScript frontend for the FTC team/video directory.

## Run locally

1. Install Node.js 20+.
2. In this directory run:

   ```bash
   npm install
   cp .env.example .env.local
   npm run dev
   ```

3. Open the local URL printed by Vite (usually http://localhost:5173).

The project starts in demo mode so the interface can be explored before the team sync is complete. Demo teams are fictional sample records, not live FIRST records.

## Connect the existing Supabase project

Edit `.env.local`:

```env
VITE_SUPABASE_URL=https://brjrinifwtusmaemlfzb.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
VITE_DEMO_MODE=false
```

Use only the project's publishable/anon key. Never put a service-role key or FIRST API token in frontend variables. The app reads `public.ftc_teams` columns `team_number`, `team_name`, and `season_year`, filters season year 2026, and uses the existing public read-only RLS policy.

## Included

- Search by exact team number or partial team name.
- Debounced search and loading/error/empty states.
- Responsive team result cards.
- Team detail modal with a placeholder for future video listings.
- Clearly labeled demo preview mode.

## Build

```bash
npm run build
```

Static output is generated in `dist/`.

## Next steps

1. Verify search against the populated Supabase table.
2. Add a video table and render team videos in the detail view.
3. Add event/alliance relationships for videos featuring multiple teams.
4. Deploy the frontend to a static hosting provider.
