-- User-owned application data relations with explicit RLS and grants.
create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null,
  earned_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);

create table if not exists public.exercise_prs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id text not null,
  exercise_name text not null,
  weight_kg numeric(8,2) not null,
  reps integer not null,
  one_rm_estimate numeric(8,2) not null,
  achieved_at timestamptz not null default now(),
  unique (user_id, exercise_id)
);

create table if not exists public.measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  logged_at date not null default current_date,
  waist numeric(6,2),
  chest numeric(6,2),
  hips numeric(6,2),
  arms numeric(6,2),
  thighs numeric(6,2),
  shoulders numeric(6,2),
  created_at timestamptz not null default now(),
  unique (user_id, logged_at)
);

create table if not exists public.streaks (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_logged_date date,
  total_days_logged integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.supplements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  category text not null default 'General',
  icon text not null default 'PillIcon',
  color text not null default '#6366f1',
  dose_amount numeric(10,2) not null default 1,
  dose_unit text not null default 'capsule',
  times_per_day integer not null default 1,
  frequency text not null default 'daily',
  stock_count numeric(10,2) not null default 0,
  stock_unit text not null default 'capsule',
  goal text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.supplement_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  supplement_id uuid not null,
  logged_at date not null default current_date,
  dose_amount numeric(10,2) not null,
  dose_unit text not null,
  taken_at timestamptz not null default now(),
  foreign key (supplement_id, user_id)
    references public.supplements(id, user_id) on delete cascade
);

create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  logged_at date not null default current_date,
  amount_ml integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  duration_seconds integer not null default 0,
  total_volume_kg numeric(12,2) not null default 0,
  exercises jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  exercises jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_exercise_prs_user_id
  on public.exercise_prs(user_id);
create index if not exists idx_measurements_user_logged_at
  on public.measurements(user_id, logged_at desc);
create index if not exists idx_supplement_logs_user_logged_at
  on public.supplement_logs(user_id, logged_at desc);
create index if not exists idx_supplements_user_active
  on public.supplements(user_id, active, created_at);
create index if not exists idx_water_logs_user_logged_at
  on public.water_logs(user_id, logged_at, created_at);
create index if not exists idx_workout_logs_user_started_at
  on public.workout_logs(user_id, started_at desc);
create index if not exists idx_workout_templates_user_created_at
  on public.workout_templates(user_id, created_at desc);

alter table public.achievements enable row level security;
alter table public.exercise_prs enable row level security;
alter table public.measurements enable row level security;
alter table public.streaks enable row level security;
alter table public.supplements enable row level security;
alter table public.supplement_logs enable row level security;
alter table public.water_logs enable row level security;
alter table public.workout_logs enable row level security;
alter table public.workout_templates enable row level security;

drop policy if exists "Users manage their own achievements" on public.achievements;
create policy "Users manage their own achievements" on public.achievements
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own exercise PRs" on public.exercise_prs;
create policy "Users manage their own exercise PRs" on public.exercise_prs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own measurements" on public.measurements;
create policy "Users manage their own measurements" on public.measurements
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own streaks" on public.streaks;
create policy "Users manage their own streaks" on public.streaks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own supplements" on public.supplements;
create policy "Users manage their own supplements" on public.supplements
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own supplement logs" on public.supplement_logs;
create policy "Users manage their own supplement logs" on public.supplement_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own water logs" on public.water_logs;
create policy "Users manage their own water logs" on public.water_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own workout logs" on public.workout_logs;
create policy "Users manage their own workout logs" on public.workout_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own workout templates" on public.workout_templates;
create policy "Users manage their own workout templates" on public.workout_templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on public.achievements, public.exercise_prs, public.measurements,
  public.streaks, public.supplements, public.supplement_logs, public.water_logs,
  public.workout_logs, public.workout_templates from anon;
grant select, insert, update, delete on public.achievements, public.exercise_prs,
  public.measurements, public.streaks, public.supplements, public.supplement_logs,
  public.water_logs, public.workout_logs, public.workout_templates to authenticated;
grant all on public.achievements, public.exercise_prs, public.measurements,
  public.streaks, public.supplements, public.supplement_logs, public.water_logs,
  public.workout_logs, public.workout_templates to service_role;
