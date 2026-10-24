-- Run this in Supabase SQL Editor

-- Create avatars storage bucket (run in Supabase Dashboard > Storage)
-- Bucket name: avatars
-- Public: true
-- File size limit: 5MB
-- Allowed MIME types: image/*

create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  name text,
  dob date,
  age int,
  gender text default 'male',
  phone_number text,
  photo_url text,
  height numeric(5,2),
  current_weight_kg numeric(5,2) check (current_weight_kg is null or current_weight_kg between 25 and 300),
  onboarding_data jsonb not null default '{}'::jsonb,
  onboarding_completed_at timestamptz,
  goal text default 'lose',
  cal_target int default 1700,
  protein_target int default 167,
  carb_target int default 144,
  fat_target int default 60,
  fiber_target int default 25,
  weight_goal numeric(5,2) default 72,
  water_goal int default 2000,
  reminder_times text[] default '{}',
  created_at timestamptz default now()
);

create table if not exists food_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  logged_at date default current_date,
  name text not null,
  qty numeric(8,2) default 100,
  unit text default 'g',
  cal numeric(8,2) default 0,
  protein numeric(8,2) default 0,
  carb numeric(8,2) default 0,
  fat numeric(8,2) default 0,
  fiber numeric(8,2) default 0,
  meal_type text default 'other',
  created_at timestamptz default now()
);

create table if not exists weight_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  logged_at date default current_date,
  weight_kg numeric(5,2) not null,
  created_at timestamptz default now()
);

create table if not exists conversations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  title text default 'KAYVEN Coach',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references conversations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);

alter table profiles enable row level security;
alter table food_logs enable row level security;
alter table weight_logs enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;

drop policy if exists "own profile" on profiles;
drop policy if exists "own food logs" on food_logs;
drop policy if exists "own weight logs" on weight_logs;
drop policy if exists "own conversations" on conversations;
drop policy if exists "own messages" on messages;

create policy "own profile" on profiles for all using (auth.uid() = id);
create policy "own food logs" on food_logs for all using (auth.uid() = user_id);
create policy "own weight logs" on weight_logs for all using (auth.uid() = user_id);
create policy "own conversations" on conversations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own messages" on messages for all using (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = auth.uid()
  )
) with check (
  auth.uid() = user_id and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = auth.uid()
  )
);

create table if not exists user_memories (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  category text not null check (category in ('preference', 'dietary_preference', 'dietary_restriction', 'food_like', 'food_dislike', 'workout_preference', 'fitness_goal', 'habit', 'routine', 'constraint', 'important_context', 'user_correction')),
  key text not null,
  value jsonb not null,
  source text not null check (source in ('user_explicit', 'user_correction', 'system_derived', 'tool_derived')),
  confidence numeric(3,2) default 0.85,
  importance integer default 3 check (importance >= 1 and importance <= 5),
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, category, key)
);

alter table user_memories enable row level security;

drop policy if exists "own memories" on user_memories;
create policy "own memories" on user_memories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_user_memories_user_id on user_memories(user_id);
create index if not exists idx_user_memories_user_active on user_memories(user_id, is_active);
create index if not exists idx_user_memories_category on user_memories(user_id, category);

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

create table if not exists subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  provider text not null,
  provider_customer_id text,
  provider_subscription_id text,
  plan_id text not null default 'free' check (plan_id in ('free', 'basic', 'standard', 'premium', 'pro')),
  status text not null check (status in ('active', 'trialing', 'past_due', 'canceled', 'expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_subscriptions_provider_subscription
  on subscriptions(provider, provider_subscription_id)
  where provider_subscription_id is not null;
create unique index if not exists idx_subscriptions_one_current_per_user
  on subscriptions(user_id)
  where status in ('active', 'trialing', 'past_due');
create index if not exists idx_subscriptions_user_id on subscriptions(user_id);

-- Normalize and constrain plans for databases created by an earlier version.
update subscriptions
set plan_id = 'free', updated_at = now()
where plan_id not in ('free', 'basic', 'standard', 'premium', 'pro');

alter table subscriptions
  drop constraint if exists subscriptions_plan_id_check;

alter table subscriptions
  add constraint subscriptions_plan_id_check
  check (plan_id in ('free', 'basic', 'standard', 'premium', 'pro'));

create table if not exists ai_usage (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  estimated_cost numeric(12,6) not null default 0 check (estimated_cost >= 0),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, period_start)
);

create index if not exists idx_ai_usage_user_period on ai_usage(user_id, period_start);

create table if not exists ai_usage_reservations (
  reservation_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  period_start timestamptz not null,
  idempotency_key uuid,
  status text not null default 'reserved'
    check (status in ('reserved', 'committed', 'released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_usage_reservations_user_period
  on ai_usage_reservations(user_id, period_start, status);

create unique index if not exists idx_ai_usage_reservations_user_idempotency
  on ai_usage_reservations(user_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists billing_webhook_events (
  id uuid default gen_random_uuid() primary key,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  provider_user_id text,
  status text not null default 'processing'
    check (status in ('processing', 'processed', 'failed')),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(provider, provider_event_id)
);

create index if not exists idx_billing_webhook_events_provider_user
  on billing_webhook_events(provider, provider_user_id);

alter table billing_webhook_events enable row level security;

drop policy if exists "No client access to billing webhook events" on billing_webhook_events;
create policy "No client access to billing webhook events"
  on billing_webhook_events for all using (false) with check (false);

alter table subscriptions enable row level security;
alter table ai_usage enable row level security;
alter table ai_usage_reservations enable row level security;
revoke all on table ai_usage_reservations from public, anon, authenticated;

drop policy if exists "own subscriptions" on subscriptions;
drop policy if exists "own ai usage" on ai_usage;
create policy "own subscriptions" on subscriptions for select using (auth.uid() = user_id);
create policy "own ai usage" on ai_usage for select using (auth.uid() = user_id);

create or replace function record_ai_usage(
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_input_tokens integer default 0,
  p_output_tokens integer default 0,
  p_estimated_cost numeric default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.ai_usage (
    user_id, period_start, period_end, request_count,
    input_tokens, output_tokens, estimated_cost
  )
  values (
    auth.uid(), p_period_start, p_period_end, 1,
    greatest(p_input_tokens, 0), greatest(p_output_tokens, 0), greatest(p_estimated_cost, 0)
  )
  on conflict (user_id, period_start) do update set
    request_count = public.ai_usage.request_count + 1,
    input_tokens = public.ai_usage.input_tokens + excluded.input_tokens,
    output_tokens = public.ai_usage.output_tokens + excluded.output_tokens,
    estimated_cost = public.ai_usage.estimated_cost + excluded.estimated_cost,
    period_end = excluded.period_end,
    updated_at = now();
end;
$$;

revoke all on function record_ai_usage(timestamptz, timestamptz, integer, integer, numeric) from public, anon, authenticated;

create or replace function public.consume_ai_usage(
  p_user_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_request_limit integer
)
returns table(allowed boolean, request_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_user_id is null then
    raise exception 'Service role required';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end <= p_period_start then
    raise exception 'Invalid usage period';
  end if;
  if p_request_limit is not null and p_request_limit < 0 then
    raise exception 'Invalid request limit';
  end if;

  if p_request_limit is null or p_request_limit > 0 then
    insert into public.ai_usage as current_usage (
      user_id, period_start, period_end, request_count
    )
    values (p_user_id, p_period_start, p_period_end, 1)
    on conflict (user_id, period_start) do update set
      request_count = current_usage.request_count + 1,
      period_end = excluded.period_end,
      updated_at = now()
    where p_request_limit is null or current_usage.request_count < p_request_limit
    returning current_usage.request_count into v_count;
  end if;

  if v_count is not null then
    return query select true, v_count;
    return;
  end if;

  select usage.request_count into v_count
  from public.ai_usage as usage
  where usage.user_id = p_user_id and usage.period_start = p_period_start;

  return query select false, coalesce(v_count, 0);
end;
$$;

create or replace function public.release_ai_usage(p_user_id uuid, p_period_start timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_user_id is null then
    raise exception 'Service role required';
  end if;

  update public.ai_usage
  set request_count = request_count - 1, updated_at = now()
  where user_id = p_user_id
    and period_start = p_period_start
    and request_count > 0;
end;
$$;

revoke all on function public.consume_ai_usage(uuid, timestamptz, timestamptz, integer) from public, anon, authenticated, service_role;
revoke all on function public.release_ai_usage(uuid, timestamptz) from public, anon, authenticated, service_role;

create or replace function public.reserve_ai_usage(
  p_user_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_request_limit integer
)
returns table(reservation_id uuid, allowed boolean, request_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_reservation_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_user_id is null then
    raise exception 'Service role required';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end <= p_period_start then
    raise exception 'Invalid usage period';
  end if;
  if p_request_limit is not null and p_request_limit < 0 then
    raise exception 'Invalid request limit';
  end if;

  if p_request_limit is null or p_request_limit > 0 then
    insert into public.ai_usage as current_usage (
      user_id, period_start, period_end, request_count
    )
    values (p_user_id, p_period_start, p_period_end, 1)
    on conflict (user_id, period_start) do update set
      request_count = current_usage.request_count + 1,
      period_end = excluded.period_end,
      updated_at = now()
    where p_request_limit is null or current_usage.request_count < p_request_limit
    returning current_usage.request_count into v_count;
  end if;

  if v_count is not null then
    insert into public.ai_usage_reservations as reservation (user_id, period_start)
    values (p_user_id, p_period_start)
    returning reservation.reservation_id into v_reservation_id;

    return query select v_reservation_id, true, v_count;
    return;
  end if;

  select usage.request_count into v_count
  from public.ai_usage as usage
  where usage.user_id = p_user_id and usage.period_start = p_period_start;

  return query select null::uuid, false, coalesce(v_count, 0);
end;
$$;

create or replace function public.reserve_ai_usage_idempotent(
  p_user_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_request_limit integer,
  p_idempotency_key uuid
)
returns table(
  reservation_id uuid,
  allowed boolean,
  request_count integer,
  duplicate boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation record;
  v_existing_id uuid;
  v_existing_period timestamptz;
  v_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_user_id is null then
    raise exception 'Service role required';
  end if;
  if p_idempotency_key is null then
    raise exception 'Idempotency key required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_idempotency_key::text, 0)
  );

  select reservation.reservation_id, reservation.period_start
  into v_existing_id, v_existing_period
  from public.ai_usage_reservations as reservation
  where reservation.user_id = p_user_id
    and reservation.idempotency_key = p_idempotency_key;

  if found then
    select usage.request_count into v_count
    from public.ai_usage as usage
    where usage.user_id = p_user_id
      and usage.period_start = v_existing_period;

    return query select v_existing_id, false, coalesce(v_count, 0), true;
    return;
  end if;

  select * into v_reservation
  from public.reserve_ai_usage(
    p_user_id,
    p_period_start,
    p_period_end,
    p_request_limit
  );

  if v_reservation.allowed then
    update public.ai_usage_reservations
    set idempotency_key = p_idempotency_key
    where public.ai_usage_reservations.reservation_id = v_reservation.reservation_id;
  end if;

  return query select
    v_reservation.reservation_id,
    v_reservation.allowed,
    v_reservation.request_count,
    false;
end;
$$;

create or replace function public.commit_ai_usage_reservation(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_reservation_id is null then
    raise exception 'Service role required';
  end if;

  update public.ai_usage_reservations
  set status = 'committed', updated_at = now()
  where reservation_id = p_reservation_id and status = 'reserved';
  if found then
    return true;
  end if;

  select status into v_status
  from public.ai_usage_reservations
  where reservation_id = p_reservation_id;
  return coalesce(v_status = 'committed', false);
end;
$$;

create or replace function public.release_ai_usage_reservation(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_period_start timestamptz;
  v_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_reservation_id is null then
    raise exception 'Service role required';
  end if;

  update public.ai_usage_reservations
  set status = 'released', updated_at = now()
  where reservation_id = p_reservation_id and status = 'reserved'
  returning user_id, period_start into v_user_id, v_period_start;

  if found then
    update public.ai_usage
    set request_count = request_count - 1, updated_at = now()
    where user_id = v_user_id
      and period_start = v_period_start
      and request_count > 0;
    return true;
  end if;

  select status into v_status
  from public.ai_usage_reservations
  where reservation_id = p_reservation_id;
  return coalesce(v_status = 'released', false);
end;
$$;

revoke all on function public.reserve_ai_usage(uuid, timestamptz, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.commit_ai_usage_reservation(uuid) from public, anon, authenticated;
revoke all on function public.release_ai_usage_reservation(uuid) from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid, timestamptz, timestamptz, integer) to service_role;
revoke all on function public.reserve_ai_usage_idempotent(uuid, timestamptz, timestamptz, integer, uuid) from public, anon, authenticated;
grant execute on function public.reserve_ai_usage_idempotent(uuid, timestamptz, timestamptz, integer, uuid) to service_role;
grant execute on function public.commit_ai_usage_reservation(uuid) to service_role;
grant execute on function public.release_ai_usage_reservation(uuid) to service_role;

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists handle_new_user();

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Orphaned reservation recovery (migration 20261018000000)
create or replace function public.release_expired_ai_usage_reservations(
  p_older_than interval default interval '15 minutes',
  p_limit integer default 500
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_released integer := 0;
  v_row record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_older_than is null or p_older_than < interval '5 minutes' then
    raise exception 'Expiry threshold must be at least 5 minutes';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 5000 then
    raise exception 'Invalid batch size';
  end if;

  for v_row in
    select reservation_id, user_id, period_start
    from public.ai_usage_reservations
    where status = 'reserved' and created_at < now() - p_older_than
    order by created_at
    limit p_limit
    for update skip locked
  loop
    update public.ai_usage_reservations
    set status = 'released', updated_at = now()
    where reservation_id = v_row.reservation_id and status = 'reserved';

    if found then
      update public.ai_usage
      set request_count = request_count - 1, updated_at = now()
      where user_id = v_row.user_id
        and period_start = v_row.period_start
        and request_count > 0;
      v_released := v_released + 1;
    end if;
  end loop;

  return v_released;
end;
$$;

revoke all on function public.release_expired_ai_usage_reservations(interval, integer) from public, anon, authenticated;
grant execute on function public.release_expired_ai_usage_reservations(interval, integer) to service_role;

-- Application data tables used by workout, hydration, supplements and progress.
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
