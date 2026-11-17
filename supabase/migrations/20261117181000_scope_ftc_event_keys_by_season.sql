alter table public.ftc_team_events
  add column if not exists season_year smallint;

update public.ftc_team_events m
set season_year = e.season_year
from public.ftc_events e
where m.event_code = e.event_code and m.season_year is null;

alter table public.ftc_team_events alter column season_year set not null;
alter table public.ftc_team_events drop constraint if exists ftc_team_events_event_code_fkey;
alter table public.ftc_events drop constraint if exists ftc_events_pkey;
alter table public.ftc_events add constraint ftc_events_pkey primary key (season_year, event_code);
alter table public.ftc_team_events drop constraint if exists ftc_team_events_pkey;
alter table public.ftc_team_events
  add constraint ftc_team_events_pkey primary key (team_number, season_year, event_code);
alter table public.ftc_team_events
  add constraint ftc_team_events_event_fkey
  foreign key (season_year, event_code)
  references public.ftc_events(season_year, event_code)
  on delete cascade;
