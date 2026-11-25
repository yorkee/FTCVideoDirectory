alter table public.ftc_events add column if not exists event_type text, add column if not exists region_code text, add column if not exists first_event_type_id integer, add column if not exists first_event_type_name text;
create index if not exists ftc_events_search_filters_idx on public.ftc_events(season_year,event_type,region_code);
create function public.search_ftc_events(p_query text default '', p_season_year integer default null,p_event_type text default null,p_region_code text default null,p_limit integer default 50,p_offset integer default 0)
returns setof public.ftc_events language sql stable security invoker set search_path = '' as $$
with q as (select lower(trim(regexp_replace(coalesce(p_query,''),'[[:space:][:punct:]]+',' ','g'))) as phrase)
select e.* from public.ftc_events e cross join q
cross join lateral (select lower(concat_ws(' ',e.event_code,e.event_name,e.city,e.state_prov,e.country,e.venue,e.region_code,replace(e.event_type,'_',' '),e.first_event_type_name,case when e.country in ('USA','US') then 'United States' end,case when e.country in ('USA','US') then case upper(e.state_prov) when 'MI' then 'Michigan' when 'AL' then 'Alabama' when 'CA' then 'California' when 'NY' then 'New York' when 'TX' then 'Texas' when 'FL' then 'Florida' when 'OH' then 'Ohio' when 'IL' then 'Illinois' end end)) as hay) h
where (p_season_year is null or e.season_year=p_season_year)
and (p_event_type is null or e.event_type=p_event_type)
and (p_region_code is null or upper(e.region_code)=upper(p_region_code))
and length(coalesce(p_query,''))<=200
and not exists (select 1 from regexp_split_to_table(q.phrase,' +') as t(token) where t.token<>'' and (case when length(t.token)<=2 then not (t.token=any(regexp_split_to_array(h.hay,'[^[:alnum:]]+'))) else strpos(h.hay,t.token)=0 end))
order by case when lower(e.event_code)=q.phrase then 0 when lower(e.event_name)=q.phrase then 1 when q.phrase<>'' and starts_with(lower(e.event_code),q.phrase) then 2 when q.phrase<>'' and strpos(lower(e.event_name),q.phrase)>0 then 3 else 4 end,e.season_year desc,e.date_start desc nulls last,e.event_code
limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,coalesce(p_offset,0));
$$;
revoke execute on function public.search_ftc_events(text,integer,text,text,integer,integer) from public;
grant execute on function public.search_ftc_events(text,integer,text,text,integer,integer) to anon,authenticated,service_role;
grant select on public.ftc_events to anon,authenticated;
notify pgrst,'reload schema';
