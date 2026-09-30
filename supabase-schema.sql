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
where plan_id not in ('free', 'premium', 'pro');

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

revoke all on function record_ai_usage(timestamptz, timestamptz, integer, integer, numeric) from public;
grant execute on function record_ai_usage(timestamptz, timestamptz, integer, integer, numeric) to authenticated;

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
