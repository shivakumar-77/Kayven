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

revoke all on function public.consume_ai_usage(uuid, timestamptz, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.release_ai_usage(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.consume_ai_usage(uuid, timestamptz, timestamptz, integer) to service_role;
grant execute on function public.release_ai_usage(uuid, timestamptz) to service_role;
