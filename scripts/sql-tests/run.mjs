// SQL integration tests for the AI quota migrations.
// Runs the REAL migration files against a disposable in-process PostgreSQL (PGlite).
// Never connects to Supabase. Limitation: PGlite has a single session, so genuinely
// concurrent transactions (row-lock races) cannot be exercised here.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const read = rel => readFileSync(join(root, rel), 'utf8')
const db = new PGlite()

const MIGRATIONS = [
  'supabase/migrations/20261015001000_reconcile_existing_app_data.sql',
  'supabase/migrations/20261017001000_atomic_ai_usage.sql',
  'supabase/migrations/20261017002000_idempotent_ai_usage_reservations.sql',
  'supabase/migrations/20261018000000_expire_orphaned_ai_reservations.sql',
  'supabase/migrations/20261018010000_ai_usage_idempotency.sql',
  'supabase/migrations/20261018020000_app_data_tables.sql',
  'supabase/migrations/20261024000000_onboarding_profile_state.sql',
  'supabase/migrations/20261025000000_health_activity_sleep_tracking.sql',
  'supabase/migrations/20261025010000_subscription_billing_period.sql',
]

// Minimal stand-ins for what Supabase provides (roles, auth.role()) plus the
// baseline tables that supabase-schema.sql creates and the migrations depend on.
const aiUsageTable = read('supabase-schema.sql').match(/create table if not exists ai_usage \([\s\S]*?\n\);/)[0]
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  create table public.profiles (id uuid primary key, created_at timestamptz default now(), age integer, height numeric);
  insert into public.profiles (id, age, height) values ('00000000-0000-0000-0000-0000000000c1', 31, 172), ('00000000-0000-0000-0000-0000000000c2', null, null);
  create table public.sleep_logs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    sleep_date date not null,
    started_at timestamptz not null,
    ended_at timestamptz not null,
    duration_minutes integer not null check (duration_minutes between 1 and 1440),
    created_at timestamptz not null default now(),
    check (ended_at > started_at)
  );
  insert into public.sleep_logs(user_id, sleep_date, started_at, ended_at, duration_minutes)
  values
    ('00000000-0000-0000-0000-0000000000c1', '2026-10-01', '2026-10-01T00:00:00Z', '2026-10-01T08:00:00Z', 480),
    ('00000000-0000-0000-0000-0000000000c1', '2026-10-01', '2026-10-01T00:00:00Z', '2026-10-01T08:00:00Z', 480);
  ${aiUsageTable}
`)

await db.exec(`
  create table public.achievements (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    achievement_id text not null,
    achieved_at timestamptz default now(),
    unique (user_id, achievement_id)
  );
  create table public.streaks (
    user_id uuid primary key references public.profiles(id) on delete cascade,
    current_streak integer not null default 0,
    longest_streak integer not null default 0,
    last_logged_date date,
    total_days_logged integer not null default 0
  );
  create table public.exercise_prs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    exercise_id text not null,
    exercise_name text not null,
    weight_kg numeric(8,2) not null,
    reps integer not null,
    one_rm_estimate numeric(8,2) not null,
    achieved_at timestamptz not null default now()
  );
  create table public.supplements (
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
    unique (id, user_id)
  );
  create table public.supplement_logs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.profiles(id) on delete cascade,
    supplement_id uuid references public.supplements(id) on delete cascade,
    logged_at date default current_date,
    dose_amount numeric(8,2),
    dose_unit text,
    taken_at timestamptz default now()
  );
  create table public.workout_logs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    name text not null,
    started_at timestamptz not null,
    finished_at timestamptz not null,
    duration_seconds integer not null default 0,
    total_volume_kg numeric(12,2) not null default 0,
    exercises jsonb not null default '[]'::jsonb
  );
  create table public.workout_templates (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    name text not null,
    exercises jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now()
  );
  insert into achievements (user_id, achievement_id)
  values ('00000000-0000-0000-0000-0000000000c1', 'legacy');
  insert into streaks (user_id, current_streak, longest_streak, total_days_logged)
  values ('00000000-0000-0000-0000-0000000000c1', 3, 5, 9);
  insert into supplements (user_id, name)
  values ('00000000-0000-0000-0000-0000000000c1', 'legacy supplement');
  insert into supplements (user_id, name)
  values ('00000000-0000-0000-0000-0000000000c2', 'other user supplement');
  insert into workout_logs (user_id, name, started_at, finished_at)
  values ('00000000-0000-0000-0000-0000000000c1', 'legacy workout', now() - interval '1 hour', now());
  insert into workout_templates (user_id, name)
  values ('00000000-0000-0000-0000-0000000000c1', 'legacy template');
`)
for (const file of MIGRATIONS) await db.exec(read(file))

const compatibility = await db.query(`
  select
    (select earned_at = achieved_at from achievements where achievement_id = 'legacy') as achievement_timestamp,
    (select updated_at is not null and current_streak = 3 from streaks where current_streak = 3) as streak_preserved,
    (select updated_at is not null from supplements where name = 'legacy supplement') as supplement_timestamp,
    (select created_at is not null from workout_logs where name = 'legacy workout') as workout_timestamp,
    (select updated_at is not null from workout_templates where name = 'legacy template') as template_timestamp
`)
assert.deepEqual(compatibility.rows[0], {
  achievement_timestamp: true,
  streak_preserved: true,
  supplement_timestamp: true,
  workout_timestamp: true,
  template_timestamp: true,
})
const preservedSleepRecords = await db.query(
  `select count(*)::int as count from public.sleep_logs where user_id = '00000000-0000-0000-0000-0000000000c1'`,
)
assert.equal(preservedSleepRecords.rows[0].count, 2, 'legacy sleep rows must be preserved without deduplication')
const billingColumns = await db.query(`
  select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'subscriptions'
`)
assert.ok(billingColumns.rows.some(row => row.column_name === 'billing_period'), 'subscriptions must retain the billing interval')
const billingPrivileges = await db.query(`
  select
    has_table_privilege('anon', 'public.subscriptions', 'select') as anon_can_read_subscriptions,
    has_table_privilege('authenticated', 'public.subscriptions', 'select') as user_can_read_subscriptions,
    has_table_privilege('authenticated', 'public.subscriptions', 'insert') as user_can_insert_subscriptions,
    has_table_privilege('authenticated', 'public.billing_webhook_events', 'select') as user_can_read_webhooks,
    has_table_privilege('service_role', 'public.billing_webhook_events', 'insert') as service_can_write_webhooks
    ,has_function_privilege('anon', 'public.apply_revenuecat_subscription_event(uuid,text,text,text,text,timestamptz,timestamptz,boolean,bigint)', 'execute') as anon_can_apply_billing_event
    ,has_function_privilege('authenticated', 'public.apply_revenuecat_subscription_event(uuid,text,text,text,text,timestamptz,timestamptz,boolean,bigint)', 'execute') as user_can_apply_billing_event
    ,has_function_privilege('service_role', 'public.apply_revenuecat_subscription_event(uuid,text,text,text,text,timestamptz,timestamptz,boolean,bigint)', 'execute') as service_can_apply_billing_event
`)
assert.deepEqual(billingPrivileges.rows[0], {
  anon_can_read_subscriptions: false,
  user_can_read_subscriptions: true,
  user_can_insert_subscriptions: false,
  user_can_read_webhooks: false,
  service_can_write_webhooks: true,
  anon_can_apply_billing_event: false,
  user_can_apply_billing_event: false,
  service_can_apply_billing_event: true,
}, 'billing tables must retain least-privilege grants')

const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
const C = '00000000-0000-0000-0000-00000000000c'
const P1 = '2026-10-01T00:00:00Z', P1_END = '2026-11-01T00:00:00Z'
const P0 = '2026-09-01T00:00:00Z', P0_END = '2026-10-01T00:00:00Z'

await db.query(`insert into profiles(id) values ($1), ($2) on conflict do nothing`, [A, B])
await db.query(`insert into profiles(id) values ($1) on conflict do nothing`, [C])
await db.query(`
  insert into public.subscriptions(user_id, provider, plan_id, billing_period, status)
  values ($1, 'revenuecat', 'basic', 'monthly', 'active'),
         ($2, 'revenuecat', 'standard', 'yearly', 'active')
`, [A, B])

async function as(role, fn) {
  await db.exec(`set role ${role}`)
  await db.query(`select set_config('request.jwt.claim.role', $1, false)`, [role])
  try { return await fn() } finally {
    await db.exec('reset role')
    await db.query(`select set_config('request.jwt.claim.role', '', false)`)
  }
}
await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [A])
const visibleSubscriptions = await as('authenticated', () => db.query('select user_id from public.subscriptions'))
assert.deepEqual(visibleSubscriptions.rows, [{ user_id: A }], 'users must only read their own subscription')
const svc = fn => as('service_role', fn)
const applyRevenueCatEvent = (planId, timestamp, status = 'active') =>
  svc(async () => (await db.query(`
    select public.apply_revenuecat_subscription_event(
      $1, 'rc-original-transaction', $2, 'monthly', $3,
      $4::timestamptz, $5::timestamptz, false, $6
    ) as applied
  `, [C, planId, status, P1, P1_END, timestamp])).rows[0].applied)
assert.equal(await applyRevenueCatEvent('basic', 1800000000000), true, 'first RevenueCat event should create a subscription record')
assert.equal(await applyRevenueCatEvent('standard', 1800000001000), true, 'newer RevenueCat event should update the subscription record')
assert.equal(await applyRevenueCatEvent('free', 1800000000500, 'expired'), false, 'older RevenueCat event must not overwrite newer state')
const orderedSubscription = await db.query(`
  select plan_id, status, provider_event_timestamp
  from public.subscriptions
  where user_id = $1 and provider = 'revenuecat'
`, [C])
assert.equal(orderedSubscription.rows[0].plan_id, 'standard', 'the latest provider event plan must remain authoritative')
assert.equal(orderedSubscription.rows[0].status, 'active', 'the latest provider event status must remain authoritative')
assert.equal(new Date(orderedSubscription.rows[0].provider_event_timestamp).getTime(), 1800000001000, 'the latest provider event timestamp must remain authoritative')
const reserve = (user, limit, start = P1, end = P1_END) =>
  svc(async () => (await db.query('select * from reserve_ai_usage($1,$2,$3,$4)', [user, start, end, limit])).rows[0])
const reserveIdempotent = (user, key, limit, start = P1, end = P1_END) =>
  svc(async () => (await db.query('select * from reserve_ai_usage_idempotent($1,$2,$3,$4,$5)', [user, start, end, limit, key])).rows[0])
const commit = id => svc(async () => (await db.query('select commit_ai_usage_reservation($1) as r', [id])).rows[0].r)
const release = id => svc(async () => (await db.query('select release_ai_usage_reservation($1) as r', [id])).rows[0].r)
const cleanup = (older = '15 minutes', limit = 500) =>
  svc(async () => (await db.query('select release_expired_ai_usage_reservations($1::interval,$2) as r', [older, limit])).rows[0].r)
const count = async (user, start = P1) =>
  (await db.query('select request_count from ai_usage where user_id=$1 and period_start=$2', [user, start])).rows[0]?.request_count ?? null
const status = async id => (await db.query('select status from ai_usage_reservations where reservation_id=$1', [id])).rows[0]?.status
const age = (id, minutes) => db.query(`update ai_usage_reservations set created_at = now() - make_interval(mins => $2) where reservation_id=$1`, [id, minutes])
const rejects = async (fn, pattern) => {
  let err
  try { await fn() } catch (e) { err = e }
  assert.ok(err, 'expected rejection')
  assert.match(String(err.message), pattern)
}
const reset = async () => {
  await db.exec('truncate ai_usage_reservations, ai_usage')
  await db.exec('truncate activity_sessions, activity_daily_summaries, health_tracking_preferences, sleep_logs')
  await db.exec(`insert into profiles(id) values ('${A}'),('${B}') on conflict do nothing`)
}

const tests = []
const test = (name, fn) => tests.push({ name, fn })

test('reserve → commit → release semantics', async () => {
  const r = await reserve(A, 10)
  assert.equal(r.allowed, true); assert.equal(r.request_count, 1); assert.ok(r.reservation_id)
  assert.equal(await commit(r.reservation_id), true)
  assert.equal(await commit(r.reservation_id), true, 'duplicate commit is idempotent')
  assert.equal(await release(r.reservation_id), false, 'release after commit is refused')
  assert.equal(await count(A), 1); assert.equal(await status(r.reservation_id), 'committed')
})

test('release is idempotent and cannot be committed afterwards', async () => {
  const r = await reserve(A, 10)
  assert.equal(await release(r.reservation_id), true)
  assert.equal(await release(r.reservation_id), true)
  assert.equal(await count(A), 0, 'second release must not decrement again')
  assert.equal(await commit(r.reservation_id), false, 'commit after release is refused')
  assert.equal(await count(A), 0)
})

test('unknown reservation ids are harmless', async () => {
  assert.equal(await commit('11111111-1111-1111-1111-111111111111'), false)
  assert.equal(await release('11111111-1111-1111-1111-111111111111'), false)
})

test('exhausted quota denies without creating a reservation', async () => {
  await reserve(A, 2); await reserve(A, 2)
  const denied = await reserve(A, 2)
  assert.equal(denied.allowed, false); assert.equal(denied.reservation_id, null); assert.equal(denied.request_count, 2)
  assert.equal(Number((await db.query('select count(*) from ai_usage_reservations')).rows[0].count), 2)
})

test('same idempotency key reuses one reservation without incrementing quota', async () => {
  const key = '10000000-0000-4000-8000-000000000001'
  const first = await reserveIdempotent(A, key, 10)
  const retry = await reserveIdempotent(A, key, 10)
  assert.equal(first.allowed, true)
  assert.equal(first.duplicate, false)
  assert.equal(retry.allowed, false)
  assert.equal(retry.duplicate, true)
  assert.equal(retry.reservation_id, first.reservation_id)
  assert.equal(await count(A), 1)
  assert.equal(await commit(first.reservation_id), true)
  const afterCommit = await reserveIdempotent(A, key, 10)
  assert.equal(afterCommit.duplicate, true)
  assert.equal(afterCommit.reservation_id, first.reservation_id)
  assert.equal(await count(A), 1)
})

test('idempotent reservation RPC rejects non-service roles', async () => {
  const key = '10000000-0000-4000-8000-000000000002'
  for (const role of ['anon', 'authenticated']) {
    await rejects(() => as(role, () => db.query(
      'select * from reserve_ai_usage_idempotent($1,$2,$3,10,$4)',
      [A, P1, P1_END, key],
    )), /permission denied|Service role required/i)
  }
})

test('many sequential reservations near the limit never exceed it', async () => {
  const results = []
  for (let i = 0; i < 25; i++) results.push((await reserve(A, 10)).allowed)
  assert.equal(results.filter(Boolean).length, 10); assert.equal(await count(A), 10)
})

test('zero limit denies, null limit is unlimited', async () => {
  assert.equal((await reserve(A, 0)).allowed, false); assert.equal(await count(A), null)
  assert.equal((await reserve(A, null)).allowed, true)
})

test("one user's reservations do not affect another user's quota", async () => {
  for (let i = 0; i < 3; i++) await reserve(A, 3)
  assert.equal((await reserve(A, 3)).allowed, false)
  const b = await reserve(B, 3)
  assert.equal(b.allowed, true); assert.equal(b.request_count, 1)
  await release(b.reservation_id)
  assert.equal(await count(A), 3)
})

test('invalid arguments are rejected', async () => {
  await rejects(() => reserve(A, -1), /Invalid request limit/)
  await rejects(() => reserve(A, 5, P1_END, P1), /Invalid usage period/)
})

test('baseline plan normalization preserves valid paid plans', async () => {
  const schema = read('supabase-schema.sql')
  const normalization = schema.match(/update subscriptions\s+set plan_id = 'free', updated_at = now\(\)\s+where plan_id not in \([^)]+\);/i)?.[0]
  assert.ok(normalization, 'baseline subscription normalization statement must exist')
  await db.exec(`create temp table subscriptions (plan_id text not null, updated_at timestamptz not null default now())`)
  await db.query(`insert into subscriptions(plan_id) values ('free'), ('basic'), ('standard'), ('premium'), ('pro'), ('legacy')`)
  await db.exec(normalization)
  const { rows } = await db.query('select plan_id from subscriptions order by plan_id')
  assert.deepEqual(rows.map(row => row.plan_id), ['basic', 'free', 'free', 'premium', 'pro', 'standard'])
})

test('cleanup releases only expired reserved rows with accurate accounting', async () => {
  const old1 = await reserve(A, 50), old2 = await reserve(A, 50), fresh = await reserve(A, 50)
  const done = await reserve(B, 50), oldB = await reserve(B, 50)
  await commit(done.reservation_id)
  await age(old1.reservation_id, 60); await age(old2.reservation_id, 30); await age(done.reservation_id, 90); await age(oldB.reservation_id, 45)
  await age(fresh.reservation_id, 1)
  assert.equal(await cleanup('15 minutes'), 3)
  assert.equal(await count(A), 1); assert.equal(await count(B), 1)
  assert.equal(await status(fresh.reservation_id), 'reserved', 'active reservation preserved')
  assert.equal(await status(done.reservation_id), 'committed', 'committed reservation preserved')
  assert.equal(await cleanup('15 minutes'), 0, 'repeat cleanup is harmless')
  assert.equal(await count(A), 1); assert.equal(await count(B), 1)
})

test('cleanup respects the threshold boundary and batch size', async () => {
  for (let i = 0; i < 5; i++) { const r = await reserve(A, 50); await age(r.reservation_id, 20) }
  assert.equal(await cleanup('30 minutes'), 0, 'younger than threshold is untouched')
  assert.equal(await cleanup('15 minutes', 2), 2)
  assert.equal(await count(A), 3)
  assert.equal(await cleanup('15 minutes', 500), 3)
  assert.equal(await count(A), 0)
})

test('cleanup rejects unsafe thresholds and batch sizes', async () => {
  await rejects(() => cleanup('1 minute'), /at least 5 minutes/)
  await rejects(() => cleanup('15 minutes', 0), /Invalid batch size/)
  await rejects(() => cleanup('15 minutes', 5001), /Invalid batch size/)
})

test('cleanup then commit/release (sequential race outcomes) never changes the count twice', async () => {
  const a = await reserve(A, 50); await age(a.reservation_id, 60)
  await cleanup('15 minutes')
  assert.equal(await commit(a.reservation_id), false, 'late commit after reaping is refused')
  assert.equal(await release(a.reservation_id), true)
  assert.equal(await count(A), 0, 'no double decrement')
  const b = await reserve(A, 50); await age(b.reservation_id, 60)
  await commit(b.reservation_id)
  assert.equal(await cleanup('15 minutes'), 0, 'committed before cleanup stays committed')
  assert.equal(await count(A), 1)
})

test('monthly boundaries: release and cleanup only touch the reservation period', async () => {
  const old = await reserve(A, 50, P0, P0_END)
  await reserve(A, 50, P1, P1_END)
  await age(old.reservation_id, 600)
  assert.equal(await cleanup('15 minutes'), 1)
  assert.equal(await count(A, P0), 0); assert.equal(await count(A, P1), 1)
  assert.equal((await reserve(A, 1, P1, P1_END)).allowed, false, 'limit is per period')
  assert.equal((await reserve(A, 1, P0, P0_END)).allowed, true, 'old period quota is independent')
})

test('request_count never underflows', async () => {
  const r = await reserve(A, 10)
  await db.query('update ai_usage set request_count = 0 where user_id=$1', [A])
  assert.equal(await release(r.reservation_id), true)
  assert.equal(await count(A), 0)
  const o = await reserve(A, 10); await db.query('update ai_usage set request_count = 0 where user_id=$1', [A]); await age(o.reservation_id, 60)
  assert.equal(await cleanup('15 minutes'), 1); assert.equal(await count(A), 0)
})

test('service-role enforcement and grants', async () => {
  const fns = [
    ['reserve_ai_usage($1,$2,$3,5)', [A, P1, P1_END]],
    ['commit_ai_usage_reservation($1)', ['11111111-1111-1111-1111-111111111111']],
    ['release_ai_usage_reservation($1)', ['11111111-1111-1111-1111-111111111111']],
    ["release_expired_ai_usage_reservations('15 minutes'::interval, 10)", []],
  ]
  for (const role of ['anon', 'authenticated']) {
    for (const [call, args] of fns) {
      await rejects(() => as(role, () => db.query(`select * from ${call}`, args)), /permission denied/)
    }
    await rejects(() => as(role, () => db.query('select * from ai_usage_reservations')), /permission denied/)
  }
  // Body-level check: even if execute were granted, a non-service JWT role is refused.
  for (const [call, args] of fns) {
    await db.query(`select set_config('request.jwt.claim.role','authenticated',false)`)
    await rejects(() => db.query(`select * from ${call}`, args), /Service role required/)
    await db.query(`select set_config('request.jwt.claim.role','',false)`)
    await rejects(() => db.query(`select * from ${call}`, args), /Service role required/)
  }
  // Legacy helpers are not callable by service_role anymore.
  await rejects(() => svc(() => db.query('select * from consume_ai_usage($1,$2,$3,5)', [A, P1, P1_END])), /permission denied/)
})

test('functions are SECURITY DEFINER with a pinned search_path', async () => {
  const { rows } = await db.query(`select proname, prosecdef, proconfig::text as cfg from pg_proc
    where proname in ('reserve_ai_usage','commit_ai_usage_reservation','release_ai_usage_reservation','release_expired_ai_usage_reservations')`)
  assert.equal(rows.length, 4)
  for (const row of rows) { assert.equal(row.prosecdef, true); assert.match(row.cfg, /search_path=public/) }
})

test('app data relations have RLS and least-privilege table grants', async () => {
  const tables = [
    'achievements',
    'exercise_prs',
    'measurements',
    'streaks',
    'supplement_logs',
    'supplements',
    'water_logs',
    'workout_logs',
    'workout_templates',
    'sleep_logs',
    'health_tracking_preferences',
    'activity_daily_summaries',
    'activity_sessions',
  ]

  for (const table of tables) {
    const { rows } = await db.query(`
      select c.relrowsecurity as rls,
        has_table_privilege('anon', 'public.${table}', 'select') as anon_read,
        has_table_privilege('authenticated', 'public.${table}', 'select') as user_read,
        has_table_privilege('authenticated', 'public.${table}', 'insert') as user_insert,
        has_table_privilege('authenticated', 'public.${table}', 'update') as user_update,
        has_table_privilege('authenticated', 'public.${table}', 'delete') as user_delete,
        has_table_privilege('service_role', 'public.${table}', 'select') as service_read,
        (select count(*) from pg_policies
          where schemaname = 'public' and tablename = '${table}') as policy_count
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = '${table}'
    `)
    assert.equal(rows.length, 1, `${table} must exist`)
    assert.equal(rows[0].rls, true, `${table} must have RLS enabled`)
    assert.equal(rows[0].anon_read, false, `${table} must not be readable by anon`)
    assert.equal(rows[0].user_read, true, `${table} must be readable by authenticated`)
    assert.equal(rows[0].user_insert, true, `${table} must be insertable by authenticated`)
    assert.equal(rows[0].user_update, true, `${table} must be updatable by authenticated`)
    assert.equal(rows[0].user_delete, true, `${table} must be deletable by authenticated`)
    assert.equal(rows[0].service_read, true, `${table} must be readable by service_role`)
    assert.equal(Number(rows[0].policy_count), 1, `${table} must have one owner policy`)
  }
})

test('onboarding migration adds durable profile state and preserves legacy completions', async () => {
  const { rows } = await db.query(`
    select id::text, current_weight_kg, onboarding_data, onboarding_completed_at
    from public.profiles
    where id in ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2')
    order by id
  `)
  assert.equal(rows.length, 2)
  assert.ok(rows[0].onboarding_completed_at, 'legacy profile with saved age and height should be treated as completed')
  assert.equal(rows[1].onboarding_completed_at, null, 'incomplete profile should remain incomplete')
  assert.deepEqual(rows[1].onboarding_data, {})
  assert.equal(rows[1].current_weight_kg, null)
})

test('supplement logs cannot reference another user supplement', async () => {
  const { rows } = await db.query(
    `insert into public.supplements(user_id, name) values ($1, 'test') returning id`,
    [A],
  )
  await rejects(() => db.query(
    `insert into public.supplement_logs(user_id, supplement_id, dose_amount, dose_unit)
     values ($1, $2, 1, 'capsule')`,
    [B, rows[0].id],
  ), /foreign key/i)
})

test('existing personal records can be upserted by user and exercise', async () => {
  const query = `insert into public.exercise_prs(user_id, exercise_id, exercise_name, weight_kg, reps, one_rm_estimate)
    values ($1, 'squat', 'Squat', 80, 5, 93)
    on conflict (user_id, exercise_id) do update set one_rm_estimate = excluded.one_rm_estimate`
  await db.query(query, [A])
  await db.query(query, [A])
  const { rows } = await db.query('select count(*)::int as count from public.exercise_prs where user_id = $1 and exercise_id = $2', [A, 'squat'])
  assert.equal(rows[0].count, 1)
})

test('health tracking data has bounded values and duplicate safeguards', async () => {
  await db.query(`insert into health_tracking_preferences(user_id) values ($1)`, [A])
  await rejects(() => db.query(
    `insert into health_tracking_preferences(user_id, step_goal) values ($1, 0)`, [B],
  ), /check constraint/i)
  await db.query(
    `insert into activity_daily_summaries(user_id, activity_date, steps) values ($1, '2026-10-25', 5000)`,
    [A],
  )
  await rejects(() => db.query(
    `insert into activity_daily_summaries(user_id, activity_date, steps) values ($1, '2026-10-25', 7000)`,
    [A],
  ), /unique constraint/i)
  const session = {
    idempotencyKey: '20000000-0000-4000-8000-000000000001',
    startedAt: '2026-10-25T06:00:00Z',
    endedAt: '2026-10-25T06:30:00Z',
  }
  await db.query(
    `insert into activity_sessions(user_id, idempotency_key, activity_type, started_at, ended_at, duration_seconds, route_points)
     values ($1, $2, 'walk', $3, $4, 1800, '[{"latitude":12.9,"longitude":77.6}]')`,
    [A, session.idempotencyKey, session.startedAt, session.endedAt],
  )
  await rejects(() => db.query(
    `insert into activity_sessions(user_id, idempotency_key, activity_type, started_at, ended_at, duration_seconds)
     values ($1, $2, 'walk', $3, $4, 1800)`,
    [A, session.idempotencyKey, session.startedAt, session.endedAt],
  ), /unique constraint/i)
  await db.query(
    `insert into sleep_logs(user_id, sleep_date, started_at, ended_at, duration_minutes, source, source_record_id)
     values ($1, '2026-10-25', '2026-10-25T00:00:00Z', '2026-10-25T08:00:00Z', 480, 'healthkit', 'sample-1')`,
    [A],
  )
  await rejects(() => db.query(
    `insert into sleep_logs(user_id, sleep_date, started_at, ended_at, duration_minutes, time_in_bed_minutes)
     values ($1, '2026-10-25', '2026-10-25T10:00:00Z', '2026-10-25T11:00:00Z', 60, 30)`,
    [A],
  ), /check constraint/i)
  await rejects(() => db.query(
    `insert into sleep_logs(user_id, sleep_date, started_at, ended_at, duration_minutes, source, source_record_id)
     values ($1, '2026-10-25', '2026-10-25T10:00:00Z', '2026-10-25T11:00:00Z', 60, 'healthkit', 'sample-1')`,
    [A],
  ), /unique constraint/i)
  await rejects(() => db.query(
    `insert into sleep_logs(user_id, sleep_date, started_at, ended_at, duration_minutes)
     values ($1, '2026-10-25', '2026-10-25T07:30:00Z', '2026-10-25T09:00:00Z', 90)`,
    [A],
  ), /overlaps an existing record/i)
})

test('health tracking RLS rejects cross-user reads and writes', async () => {
  await db.query(`insert into health_tracking_preferences(user_id) values ($1)`, [A])
  await db.query(
    `insert into activity_daily_summaries(user_id, activity_date, steps) values ($1, '2026-10-25', 4321)`,
    [A],
  )
  await db.exec('set role authenticated')
  await db.query(`select set_config('request.jwt.claim.role', 'authenticated', false)`)
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [B])
  const hidden = await db.query(`select steps from activity_daily_summaries where user_id = $1`, [A])
  assert.equal(hidden.rows.length, 0, 'another user cannot read the activity summary')
  await rejects(() => db.query(
    `insert into activity_daily_summaries(user_id, activity_date, steps) values ($1, '2026-10-26', 10)`,
    [A],
  ), /row-level security/i)
  const deleted = await db.query(
    `delete from activity_daily_summaries where user_id = $1 returning activity_date`,
    [A],
  )
  assert.equal(deleted.rows.length, 0, 'another user cannot delete an activity summary')
  await db.exec('reset role')
  await db.query(`select set_config('request.jwt.claim.role', '', false)`)
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
})

let failed = 0
for (const { name, fn } of tests) {
  await reset()
  try { await fn(); console.log(`  ok   ${name}`) } catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message}`) }
}
console.log(`\n${tests.length - failed}/${tests.length} SQL tests passed (PGlite, single session; no concurrent-transaction coverage)`)
await db.close()
process.exit(failed ? 1 : 0)
