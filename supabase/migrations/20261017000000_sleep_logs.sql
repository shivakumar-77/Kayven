create table if not exists public.sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  sleep_date date not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  created_at timestamptz not null default now(),
  check (ended_at > started_at)
);

create index if not exists idx_sleep_logs_user_sleep_date
  on public.sleep_logs(user_id, sleep_date desc);

alter table public.sleep_logs enable row level security;

drop policy if exists "own sleep logs" on public.sleep_logs;
create policy "own sleep logs"
  on public.sleep_logs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
