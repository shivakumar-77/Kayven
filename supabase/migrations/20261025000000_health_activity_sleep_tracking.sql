create table if not exists public.health_tracking_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  step_goal integer not null default 8000 check (step_goal between 1000 and 100000),
  sleep_goal_minutes integer not null default 480 check (sleep_goal_minutes between 180 and 900),
  time_zone text not null default 'UTC' check (length(time_zone) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_daily_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_date date not null,
  steps integer not null default 0 check (steps between 0 and 1000000),
  source text not null default 'manual' check (source in ('manual', 'device', 'imported')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, activity_date)
);

create table if not exists public.activity_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key uuid not null,
  activity_type text not null check (activity_type in ('walk', 'run')),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds integer not null check (duration_seconds between 1 and 86400),
  distance_meters numeric(12, 2) not null default 0 check (distance_meters >= 0),
  average_pace_seconds_per_km numeric(10, 2),
  average_speed_mps numeric(8, 3),
  estimated_calories numeric(10, 2),
  route_points jsonb not null default '[]'::jsonb,
  source text not null default 'browser_gps' check (source in ('browser_gps', 'manual', 'healthkit', 'health_connect')),
  created_at timestamptz not null default now(),
  check (ended_at > started_at),
  check (jsonb_typeof(route_points) = 'array' and jsonb_array_length(route_points) <= 3000),
  check (estimated_calories is null or estimated_calories >= 0),
  unique (user_id, idempotency_key)
);

create index if not exists idx_activity_daily_summaries_user_date
  on public.activity_daily_summaries(user_id, activity_date desc);
create index if not exists idx_activity_sessions_user_started_at
  on public.activity_sessions(user_id, started_at desc);

alter table public.sleep_logs
  add column if not exists time_in_bed_minutes integer
    check (time_in_bed_minutes is null or time_in_bed_minutes between 1 and 1440),
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'healthkit', 'health_connect', 'imported')),
  add column if not exists source_record_id text,
  add column if not exists notes text
    check (notes is null or length(notes) <= 1000);

alter table public.sleep_logs
  add constraint sleep_time_in_bed_not_shorter
  check (time_in_bed_minutes is null or time_in_bed_minutes >= duration_minutes)
  not valid;

create index if not exists idx_sleep_logs_user_interval
  on public.sleep_logs(user_id, started_at, ended_at);
create unique index if not exists idx_sleep_logs_user_source_record
  on public.sleep_logs(user_id, source, source_record_id)
  where source_record_id is not null;

create or replace function public.prevent_overlapping_sleep_logs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if exists (
    select 1
    from public.sleep_logs existing
    where existing.user_id = new.user_id
      and existing.id is distinct from new.id
      and existing.started_at < new.ended_at
      and existing.ended_at > new.started_at
  ) then
    raise exception 'Sleep interval overlaps an existing record'
      using errcode = '23P01';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_overlapping_sleep_logs on public.sleep_logs;
create trigger prevent_overlapping_sleep_logs
  before insert or update of user_id, started_at, ended_at on public.sleep_logs
  for each row execute function public.prevent_overlapping_sleep_logs();

alter table public.health_tracking_preferences enable row level security;
alter table public.activity_daily_summaries enable row level security;
alter table public.activity_sessions enable row level security;
alter table public.sleep_logs enable row level security;

drop policy if exists "Users manage their own health tracking preferences" on public.health_tracking_preferences;
create policy "Users manage their own health tracking preferences"
  on public.health_tracking_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own activity summaries" on public.activity_daily_summaries;
create policy "Users manage their own activity summaries"
  on public.activity_daily_summaries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own activity sessions" on public.activity_sessions;
create policy "Users manage their own activity sessions"
  on public.activity_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own sleep logs" on public.sleep_logs;
create policy "own sleep logs"
  on public.sleep_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on public.health_tracking_preferences, public.activity_daily_summaries,
  public.activity_sessions, public.sleep_logs from anon;
grant select, insert, update, delete on public.health_tracking_preferences,
  public.activity_daily_summaries, public.activity_sessions, public.sleep_logs to authenticated;
grant all on public.health_tracking_preferences, public.activity_daily_summaries,
  public.activity_sessions, public.sleep_logs to service_role;
