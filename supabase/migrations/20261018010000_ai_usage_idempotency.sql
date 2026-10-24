alter table public.ai_usage_reservations
  add column if not exists idempotency_key uuid;

create unique index if not exists idx_ai_usage_reservations_user_idempotency
  on public.ai_usage_reservations(user_id, idempotency_key)
  where idempotency_key is not null;

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

revoke all on function public.reserve_ai_usage_idempotent(uuid, timestamptz, timestamptz, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_usage_idempotent(uuid, timestamptz, timestamptz, integer, uuid)
  to service_role;
