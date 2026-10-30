create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  provider_customer_id text,
  provider_subscription_id text,
  provider_event_timestamp timestamptz,
  plan_id text not null default 'free' check (plan_id in ('free', 'basic', 'standard', 'premium', 'pro')),
  status text not null check (status in ('active', 'trialing', 'past_due', 'canceled', 'expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.subscriptions
  add column if not exists billing_period text
  check (billing_period is null or billing_period in ('monthly', 'yearly'));
alter table public.subscriptions
  add column if not exists provider_event_timestamp timestamptz;

create unique index if not exists idx_subscriptions_provider_subscription
  on public.subscriptions(provider, provider_subscription_id)
  where provider_subscription_id is not null;
create unique index if not exists idx_subscriptions_one_current_per_user
  on public.subscriptions(user_id)
  where status in ('active', 'trialing', 'past_due');
create index if not exists idx_subscriptions_user_id
  on public.subscriptions(user_id);

alter table public.subscriptions enable row level security;
drop policy if exists "own subscriptions" on public.subscriptions;
create policy "own subscriptions" on public.subscriptions
  for select using (auth.uid() = user_id);
revoke all on public.subscriptions from public, anon, authenticated;
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;

create or replace function public.apply_revenuecat_subscription_event(
  p_user_id uuid,
  p_provider_subscription_id text,
  p_plan_id text,
  p_billing_period text,
  p_status text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_event_timestamp_ms bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_applied boolean := false;
  v_event_timestamp timestamptz;
begin
  if p_user_id is null
    or nullif(btrim(p_provider_subscription_id), '') is null
    or p_event_timestamp_ms is null
    or p_event_timestamp_ms <= 0 then
    raise exception 'Invalid RevenueCat subscription event';
  end if;

  v_event_timestamp := to_timestamp(p_event_timestamp_ms::double precision / 1000.0);

  insert into public.subscriptions (
    user_id,
    provider,
    provider_customer_id,
    provider_subscription_id,
    provider_event_timestamp,
    plan_id,
    billing_period,
    status,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    updated_at
  )
  values (
    p_user_id,
    'revenuecat',
    p_user_id::text,
    p_provider_subscription_id,
    v_event_timestamp,
    p_plan_id,
    p_billing_period,
    p_status,
    p_current_period_start,
    p_current_period_end,
    coalesce(p_cancel_at_period_end, false),
    now()
  )
  on conflict (provider, provider_subscription_id)
    where provider_subscription_id is not null
  do update set
    user_id = excluded.user_id,
    provider_customer_id = excluded.provider_customer_id,
    provider_event_timestamp = excluded.provider_event_timestamp,
    plan_id = excluded.plan_id,
    billing_period = excluded.billing_period,
    status = excluded.status,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    updated_at = now()
  where public.subscriptions.provider_event_timestamp is null
    or public.subscriptions.provider_event_timestamp < excluded.provider_event_timestamp
  returning true into v_applied;

  return coalesce(v_applied, false);
end;
$$;

revoke all on function public.apply_revenuecat_subscription_event(
  uuid, text, text, text, text, timestamptz, timestamptz, boolean, bigint
) from public, anon, authenticated;
grant execute on function public.apply_revenuecat_subscription_event(
  uuid, text, text, text, text, timestamptz, timestamptz, boolean, bigint
) to service_role;

create table if not exists public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  provider_user_id text,
  status text not null default 'processing'
    check (status in ('processing', 'processed', 'failed')),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists idx_billing_webhook_events_provider_user
  on public.billing_webhook_events(provider, provider_user_id);
alter table public.billing_webhook_events enable row level security;
drop policy if exists "No client access to billing webhook events" on public.billing_webhook_events;
create policy "No client access to billing webhook events" on public.billing_webhook_events
  for all using (false) with check (false);
revoke all on public.billing_webhook_events from public, anon, authenticated;
grant all on public.billing_webhook_events to service_role;
