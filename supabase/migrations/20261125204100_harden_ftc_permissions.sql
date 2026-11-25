-- Explicit grants for future objects created by postgres in public.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, service_role;
-- PUBLIC function execution is a global default, not removable by a schema-only revoke.
alter default privileges for role postgres revoke execute on functions from public;

revoke all on public.ftc_teams, public.ftc_events, public.ftc_team_events, public.ftc_event_videos, public.ftc_video_processing_jobs from public, anon, authenticated, service_role;
grant select on public.ftc_teams, public.ftc_events, public.ftc_team_events, public.ftc_event_videos to anon, authenticated;
grant select, insert, update, delete on public.ftc_teams, public.ftc_events, public.ftc_team_events, public.ftc_event_videos, public.ftc_video_processing_jobs to service_role;
revoke all on sequence public.ftc_video_processing_jobs_id_seq from public, anon, authenticated, service_role;
grant usage, select on sequence public.ftc_video_processing_jobs_id_seq to service_role;

revoke all on function public.enqueue_ftc_video_processing_job() from public, anon, authenticated, service_role;
grant execute on function public.enqueue_ftc_video_processing_job() to service_role;
revoke all on function public.claim_next_ftc_video_job(text, integer), public.finish_ftc_video_job(bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_next_ftc_video_job(text, integer), public.finish_ftc_video_job(bigint, boolean, text) to service_role;
revoke all on function public.search_ftc_events(text, integer, text, text, integer, integer) from public;
grant execute on function public.search_ftc_events(text, integer, text, text, integer, integer) to anon, authenticated, service_role;

-- Fail migration if effective privileges do not match the intended public boundary.
do $$
declare
  r text;
  t text;
  p text;
begin
  foreach r in array array['anon','authenticated'] loop
    foreach t in array array['ftc_teams','ftc_events','ftc_team_events','ftc_event_videos','ftc_video_processing_jobs'] loop
      foreach p in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
        if has_table_privilege(r, 'public.' || t, p) then
          raise exception 'Unexpected privilege: % % %', r,t,p;
        end if;
      end loop;
      if has_table_privilege(r,'public.' || t,'SELECT') <> (t <> 'ftc_video_processing_jobs') then
        raise exception 'Unexpected read privilege: % %',r,t;
      end if;
    end loop;
    if has_function_privilege(r,'public.claim_next_ftc_video_job(text,integer)','EXECUTE') or
       has_function_privilege(r,'public.finish_ftc_video_job(bigint,boolean,text)','EXECUTE') or
       has_function_privilege(r,'public.enqueue_ftc_video_processing_job()','EXECUTE') then
      raise exception 'Unexpected queue function access: %',r;
    end if;
    if not has_function_privilege(r,'public.search_ftc_events(text,integer,text,text,integer,integer)','EXECUTE') then
      raise exception 'Missing event search access: %',r;
    end if;
  end loop;
end $$;
notify pgrst, 'reload schema';
