create table public.ftc_event_videos (season_year smallint not null, event_code text not null, youtube_url text not null, recording_type text not null default 'unknown' check(recording_type in ('practice','competition','unknown')), verified boolean not null default false, primary key(season_year,event_code,youtube_url), foreign key(season_year,event_code) references public.ftc_events(season_year,event_code) on delete cascade);
alter table public.ftc_event_videos enable row level security;
create policy "Public event videos" on public.ftc_event_videos for select to anon,authenticated using (true);
grant select on public.ftc_event_videos to anon,authenticated;
grant select,insert,update,delete on public.ftc_event_videos to service_role;
