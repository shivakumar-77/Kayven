-- Releases AI usage reservations abandoned after a server crash.
-- Additive: adds one function; does not alter existing tables or functions.
-- Policy: a reservation still 'reserved' after the expiry threshold is released
-- (the user is not charged for requests that never completed). The threshold has
-- a 5 minute floor so in-flight provider calls (<= 60s timeout) are never released.
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
