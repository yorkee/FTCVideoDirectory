-- Reconstructed from the production schema; must precede the first event migration.
-- Existing production databases must register this version only after verification.
create extension if not exists pg_trgm with schema extensions;

create table public.ftc_teams (
  team_number integer primary key,
  season_year smallint not null default 2026,
  team_name text not null
);
comment on table public.ftc_teams is 'Current-season FTC team directory synchronized from FIRST. Historical seasons are not retained in this MVP.';
comment on column public.ftc_teams.season_year is 'Season start year; currently 2026 represents the 2026-2027 FTC season.';
create index ftc_teams_team_name_trgm_idx on public.ftc_teams using gin (team_name extensions.gin_trgm_ops);
alter table public.ftc_teams enable row level security;
create policy "FTC teams are publicly readable" on public.ftc_teams for select to authenticated, anon using (true);
revoke all on public.ftc_teams from anon, authenticated;
grant select on public.ftc_teams to anon, authenticated;
grant all on public.ftc_teams to service_role;
