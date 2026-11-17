create table if not exists public.ftc_events (
  event_code text primary key,
  season_year smallint not null,
  event_name text not null,
  date_start date,
  date_end date,
  venue text,
  city text,
  state_prov text,
  country text,
  youtube_url text,
  youtube_verified boolean not null default false,
  youtube_last_searched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ftc_events_youtube_url_check
    check (youtube_url is null or youtube_url ~* '^https?://(www\.)?(youtube\.com|youtu\.be)/')
);

create table if not exists public.ftc_team_events (
  team_number integer not null references public.ftc_teams(team_number) on delete cascade,
  event_code text not null references public.ftc_events(event_code) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_number, event_code)
);

create index if not exists ftc_team_events_event_code_idx
  on public.ftc_team_events(event_code);

alter table public.ftc_events enable row level security;
alter table public.ftc_team_events enable row level security;

drop policy if exists "Public can read FTC events" on public.ftc_events;
create policy "Public can read FTC events"
  on public.ftc_events for select to anon, authenticated
  using (true);

drop policy if exists "Public can read FTC team event mappings" on public.ftc_team_events;
create policy "Public can read FTC team event mappings"
  on public.ftc_team_events for select to anon, authenticated
  using (true);

grant select on public.ftc_events to anon, authenticated;
grant select on public.ftc_team_events to anon, authenticated;
grant all on public.ftc_events to service_role;
grant all on public.ftc_team_events to service_role;
