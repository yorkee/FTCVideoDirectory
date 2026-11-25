alter table public.ftc_events add column if not exists official_livestream_url text, add column if not exists video_discovery_next_at timestamptz;
