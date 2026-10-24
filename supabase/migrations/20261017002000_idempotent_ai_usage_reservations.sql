create table if not exists public.ai_usage_reservations (
  reservation_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  period_start timestamptz not null,
  status text not null default 'reserved'
    check (status in ('reserved', 'committed', 'released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_usage_reservations_user_period
  on public.ai_usage_reservations(user_id, period_start, status);

alter table public.ai_usage_reservations enable row level security;
revoke all on table public.ai_usage_reservations from public, anon, authenticated;
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
grant execute on function public.commit_ai_usage_reservation(uuid) to service_role;
grant execute on function public.release_ai_usage_reservation(uuid) to service_role;
