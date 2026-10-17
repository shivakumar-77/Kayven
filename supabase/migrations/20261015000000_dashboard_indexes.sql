-- FOR REVIEW ONLY: not applied to any database.
-- Dashboard and health-agent index proposal. Verify first with EXPLAIN (ANALYZE, BUFFERS)
-- on a staging copy; the benefit grows with table size and may be negligible on small tables.
--
-- Queries served (all filter user_id with equality, then logged_at):
--   dashboard  food_logs   .eq(user_id).eq(logged_at, today).order(created_at)
--   dashboard  water_logs  .eq(user_id).eq(logged_at, today)
--   agent      food_logs   .eq(user_id).gte/lte(logged_at).order(logged_at desc, created_at desc).limit(500)
--   agent      weight_logs .eq(user_id).gte/lte(logged_at).order(logged_at asc).limit(100)
-- The food index includes created_at for the agent ordering; reverse scanning supports the
-- dashboard's ascending created_at order because logged_at is fixed to one date.
-- Cost: extra storage and a small write overhead on each insert; there are no existing
-- indexes on these tables in supabase-schema.sql (confirm against the live database).
-- For large live tables, run CREATE INDEX CONCURRENTLY outside a transaction instead.

create index if not exists idx_food_logs_user_logged_created_at
  on public.food_logs (user_id, logged_at desc, created_at desc);
create index if not exists idx_weight_logs_user_logged_at
  on public.weight_logs (user_id, logged_at);

-- water_logs is not defined in supabase-schema.sql (application code uses user_id, logged_at,
-- amount_ml). Create the index only if the live table has both columns; confirm the live schema.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'water_logs' and column_name = 'user_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'water_logs' and column_name = 'logged_at'
  ) then
    execute 'create index if not exists idx_water_logs_user_logged_at on public.water_logs (user_id, logged_at)';
  end if;
end $$;
