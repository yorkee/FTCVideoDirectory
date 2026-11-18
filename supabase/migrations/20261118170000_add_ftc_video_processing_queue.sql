create table if not exists public.ftc_video_processing_jobs (
  id bigint generated always as identity primary key,
  season_year smallint not null,
  event_code text not null,
  event_name text not null,
  video_url text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  locked_by text,
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_year, event_code, video_url)
);

create index if not exists ftc_video_processing_jobs_pending_idx
  on public.ftc_video_processing_jobs (status, created_at)
  where status = 'pending';

alter table public.ftc_video_processing_jobs enable row level security;
revoke all on public.ftc_video_processing_jobs from anon, authenticated;
grant all on public.ftc_video_processing_jobs to service_role;

create or replace function public.enqueue_ftc_video_processing_job()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.youtube_url is not null
     and (tg_op = 'INSERT' or old.youtube_url is distinct from new.youtube_url) then
    insert into public.ftc_video_processing_jobs (
      season_year, event_code, event_name, video_url
    )
    values (
      new.season_year, new.event_code, new.event_name, new.youtube_url
    )
    on conflict (season_year, event_code, video_url) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists enqueue_ftc_video_processing_job on public.ftc_events;
create trigger enqueue_ftc_video_processing_job
after insert or update of youtube_url on public.ftc_events
for each row execute function public.enqueue_ftc_video_processing_job();

-- Backfill event videos already discovered before this queue was installed.
insert into public.ftc_video_processing_jobs (
  season_year, event_code, event_name, video_url
)
select season_year, event_code, event_name, youtube_url
from public.ftc_events
where youtube_url is not null
on conflict (season_year, event_code, video_url) do nothing;

-- Atomically claim one pending job. Expired processing leases can be reclaimed.
create or replace function public.claim_next_ftc_video_job(
  p_worker_id text,
  p_lease_seconds integer default 21600
)
returns setof public.ftc_video_processing_jobs
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  with candidate as (
    select id
    from public.ftc_video_processing_jobs
    where attempts < 5
      and (
        status = 'pending'
        or (status = 'processing' and locked_at < now() - make_interval(secs => greatest(p_lease_seconds, 60)))
      )
    order by created_at
    for update skip locked
    limit 1
  )
  update public.ftc_video_processing_jobs j
  set status = 'processing',
      attempts = j.attempts + 1,
      locked_by = p_worker_id,
      locked_at = now(),
      updated_at = now()
  from candidate
  where j.id = candidate.id
  returning j.*;
end;
$$;

create or replace function public.finish_ftc_video_job(
  p_job_id bigint,
  p_success boolean,
  p_error text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.ftc_video_processing_jobs
  set status = case when p_success then 'completed' else 'pending' end,
      last_error = case when p_success then null else left(coalesce(p_error, 'Unknown processing error'), 4000) end,
      locked_by = null,
      locked_at = null,
      updated_at = now()
  where id = p_job_id
    and status = 'processing';
end;
$$;

revoke all on function public.claim_next_ftc_video_job(text, integer) from public, anon, authenticated;
revoke all on function public.finish_ftc_video_job(bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_next_ftc_video_job(text, integer) to service_role;
grant execute on function public.finish_ftc_video_job(bigint, boolean, text) to service_role;
