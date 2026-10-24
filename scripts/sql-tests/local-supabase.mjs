// Integration tests against a DISPOSABLE LOCAL Supabase stack (Docker). Never run against hosted projects.
//   cd <local-workspace> && supabase start && supabase db reset --local
//   KAYVEN_SUPABASE_WORKDIR=<local-workspace> npm run test:sql:local
// Real: Postgres 17, separate connections, GoTrue JWTs, PostgREST role mapping.
import { execFileSync } from 'node:child_process'
import { randomUUID, randomBytes } from 'node:crypto'
import pg from 'pg'

const workdir = process.env.KAYVEN_SUPABASE_WORKDIR || '/tmp/kayven-supabase-local'
const env = Object.fromEntries(
  execFileSync('supabase', ['status', '-o', 'env'], { cwd: workdir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split('\n').map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]),
)
const isLocal = (u) => ['127.0.0.1', 'localhost'].includes(new URL(u).hostname)
if (!env.DB_URL || !env.API_URL || !isLocal(env.DB_URL) || !isLocal(env.API_URL)) {
  console.error('Refusing to run: target is not a local Supabase stack.')
  process.exit(2)
}
const { API_URL, ANON_KEY, SERVICE_ROLE_KEY } = env
const pool = new pg.Pool({ connectionString: env.DB_URL, max: 60 })

let passed = 0, failed = 0
const results = []
async function test(name, fn) {
  try { await fn(); passed++; results.push(`PASS ${name}`) }
  catch (e) { failed++; results.push(`FAIL ${name}: ${e.message}`) }
}
const ok = (c, m) => { if (!c) throw new Error(m) }
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: expected ${b}, got ${a}`) }
function sanitizeDiagnostic(value) {
  return String(value)
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, '[redacted-jwt]')
    .replace(/\bBearer\s+[^\s"',}]+/gi, 'Bearer [redacted]')
    .replace(/\b[A-Fa-f0-9]{8}-[A-Fa-f0-9-]{27,}\b/g, '[redacted-uuid]')
    .replace(/(apikey|authorization|service.role.key|secret)\s*[:=]\s*["']?[^"',}\s]+/gi, '$1=[redacted]')
}

const sql = async (text, params) => (await pool.query(text, params)).rows
// Runs one statement on its own connection/transaction with the service_role claim, like PostgREST does.
async function asRole(role, text, params) {
  const c = await pool.connect()
  try {
    await c.query('begin')
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role })])
    if (role !== 'postgres') await c.query(`set local role ${role}`)
    const r = await c.query(text, params)
    await c.query('commit')
    return r.rows
  } catch (e) { await c.query('rollback').catch(() => {}); throw e } finally { c.release() }
}
async function asUser(userId, fn) {
  const c = await pool.connect()
  try {
    await c.query('begin')
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ role: 'authenticated', sub: userId }),
    ])
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId])
    await c.query('set local role authenticated')
    const result = await fn(c)
    await c.query('commit')
    return result
  } catch (e) {
    await c.query('rollback').catch(() => {})
    throw e
  } finally {
    c.release()
  }
}
const svc = (text, params) => asRole('service_role', text, params)
const reserve = (u, ps, pe, lim) => svc('select * from public.reserve_ai_usage($1,$2,$3,$4)', [u, ps, pe, lim])
const reserveIdempotent = (u, ps, pe, lim, key) => svc(
  'select * from public.reserve_ai_usage_idempotent($1,$2,$3,$4,$5)',
  [u, ps, pe, lim, key],
)
const rpc = async (name, body, key, bearer = key) => {
  const r = await fetch(`${API_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: key, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const text = await r.text()
  return { status: r.status, body: (() => { try { return JSON.parse(text) } catch { return null } })(), diagnostic: sanitizeDiagnostic(text).slice(0, 300) }
}

const P1 = '2026-10-01T00:00:00Z', P1E = '2026-11-01T00:00:00Z'
const P0 = '2026-09-01T00:00:00Z', P0E = '2026-10-01T00:00:00Z'
const created = []
async function makeUser(label) {
  const email = `kayven-it-${label}-${randomBytes(4).toString('hex')}@example.test`
  const password = randomBytes(12).toString('hex')
  const r = await fetch(`${API_URL}/auth/v1/admin/users`, {
    method: 'POST', headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  const u = await r.json(); ok(u.id, 'user creation failed')
  created.push(u.id)
  await sql('insert into public.profiles (id, name) values ($1,$2) on conflict do nothing', [u.id, `it-${label}`])
  const t = await fetch(`${API_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  })
  return { id: u.id, jwt: (await t.json()).access_token }
}
// Accounting invariant: ai_usage.request_count == number of reserved + committed reservations for that period.
async function invariant(user, period, label) {
  const [u] = await sql('select request_count from public.ai_usage where user_id=$1 and period_start=$2', [user, period])
  const [r] = await sql(`select count(*)::int n from public.ai_usage_reservations where user_id=$1 and period_start=$2 and status in ('reserved','committed')`, [user, period])
  eq(u?.request_count ?? 0, r.n, `${label}: request_count vs live reservations`)
}

try {
  const A = await makeUser('a'), B = await makeUser('b')

  await test('application data tables enforce user isolation and reject cross-user writes', async () => {
    const supplement = (await sql(
      `insert into public.supplements(user_id, name) values ($1, 'rls test') returning id`,
      [A.id],
    ))[0]
    const rows = [
      ['achievements', `insert into public.achievements(user_id, achievement_id) values ($1, $2)`, [A.id, randomUUID()]],
      ['exercise_prs', `insert into public.exercise_prs(user_id, exercise_id, exercise_name, weight_kg, reps, one_rm_estimate) values ($1, $2, 'Test', 10, 1, 10)`, [A.id, randomUUID()]],
      ['measurements', `insert into public.measurements(user_id, logged_at) values ($1, $2)`, [A.id, '2026-10-19']],
      ['streaks', `insert into public.streaks(user_id) values ($1)`, [A.id]],
      ['supplements', `insert into public.supplements(user_id, name) values ($1, $2)`, [A.id, `rls-${randomUUID()}`]],
      ['supplement_logs', `insert into public.supplement_logs(user_id, supplement_id, dose_amount, dose_unit) values ($1, $2, 1, 'capsule')`, [A.id, supplement.id]],
      ['water_logs', `insert into public.water_logs(user_id, amount_ml) values ($1, 250)`, [A.id]],
      ['workout_logs', `insert into public.workout_logs(user_id, name, started_at, finished_at) values ($1, 'RLS test', now(), now())`, [A.id]],
      ['workout_templates', `insert into public.workout_templates(user_id, name) values ($1, 'RLS test')`, [A.id]],
    ]
    for (const [, insert, params] of rows) await sql(insert, params)

    await asUser(B.id, async (client) => {
      for (const [table] of rows) {
        const result = await client.query(`select user_id from public.${table} where user_id = $1`, [A.id])
        eq(result.rowCount, 0, `${table}: user B must not read user A rows`)
      }
      const ownWrite = await client.query(
        `insert into public.measurements(user_id, logged_at) values ($1, $2) returning user_id`,
        [B.id, '2026-10-20'],
      )
      eq(ownWrite.rowCount, 1, 'user B must be able to write their own measurement')
    })

    let crossUserWriteError
    try {
      await asUser(B.id, (client) => client.query(
        `insert into public.measurements(user_id, logged_at) values ($1, $2)`,
        [A.id, '2026-10-20'],
      ))
    } catch (error) {
      crossUserWriteError = error
    }
    ok(crossUserWriteError?.code === '42501', 'authenticated cross-user insert must fail the RLS policy')

    let anonReadError
    try {
      await asRole('anon', 'select * from public.measurements limit 1')
    } catch (error) {
      anonReadError = error
    }
    ok(anonReadError?.code === '42501', 'anon must not have table read privileges')
  })

  await test('40 parallel reserves (separate connections), limit 10: exactly 10 allowed', async () => {
    const res = await Promise.all(Array.from({ length: 40 }, () => reserve(A.id, P1, P1E, 10)))
    eq(res.filter((r) => r[0].allowed).length, 10, 'allowed count')
    eq(res.filter((r) => r[0].reservation_id).length, 10, 'reservation ids')
    eq(res.filter((r) => r[0].allowed).length + res.filter((r) => !r[0].allowed).length, 40, 'total')
    await invariant(A.id, P1, 'after reserve race')
  })

  await test('same race over PostgREST HTTP with service-role key: exactly 5 allowed', async () => {
    const repeats = Math.max(1, Math.min(30, Number(process.env.KAYVEN_HTTP_RACE_REPEATS) || 1))
    const observations = []
    for (let run = 0; run < repeats; run++) {
      const user = run === 0 ? B : await makeUser(`http${run}`)
      const res = await Promise.all(Array.from({ length: 25 }, () => rpc('reserve_ai_usage', { p_user_id: user.id, p_period_start: P1, p_period_end: P1E, p_request_limit: 5 }, SERVICE_ROLE_KEY)))
      const failures = res.filter((r) => r.status !== 200)
      const statusCounts = Object.fromEntries([...new Set(res.map((r) => r.status))].map((status) => [status, res.filter((r) => r.status === status).length]))
      ok(failures.length === 0, `run ${run + 1}/${repeats}: status counts ${JSON.stringify(statusCounts)}; first non-200 sanitized body=${failures[0]?.diagnostic || 'none'}`)
      eq(res.filter((r) => r.body[0]?.allowed).length, 5, `run ${run + 1}: allowed count`)
      observations.push(...res)
      await invariant(user.id, P1, `http race run ${run + 1}`)
    }
    const statusCounts = Object.fromEntries([...new Set(observations.map((r) => r.status))]
      .map((status) => [status, observations.filter((r) => r.status === status).length]))
    console.log(`Sanitized PostgREST evidence: ${JSON.stringify({
      statusCounts,
      sampleBody: sanitizeDiagnostic(JSON.stringify(observations[0]?.body)),
    })}`)
  })

  await test('same idempotency key over concurrent PostgREST requests creates one reservation', async () => {
    const user = await makeUser('same-key')
    const key = randomUUID()
    const requests = await Promise.all(Array.from({ length: 30 }, () => rpc(
      'reserve_ai_usage_idempotent',
      { p_user_id: user.id, p_period_start: P1, p_period_end: P1E, p_request_limit: 5, p_idempotency_key: key },
      SERVICE_ROLE_KEY,
    )))
    ok(requests.every((response) => response.status === 200), 'idempotent reserve HTTP failure')
    const rows = requests.flatMap((response) => Array.isArray(response.body) ? response.body : [])
    eq(rows.length, 30, 'response row count')
    eq(rows.filter((row) => row.allowed && !row.duplicate).length, 1, 'new reservation count')
    eq(rows.filter((row) => row.duplicate).length, 29, 'duplicate response count')
    ok(rows.every((row) => row.reservation_id === rows[0].reservation_id), 'same reservation id')
    eq((await sql('select request_count from public.ai_usage where user_id=$1 and period_start=$2', [user.id, P1]))[0].request_count, 1, 'usage count')
    eq((await sql('select count(*)::int n from public.ai_usage_reservations where user_id=$1 and idempotency_key=$2', [user.id, key]))[0].n, 1, 'reservation row count')
    await invariant(user.id, P1, 'same-key concurrent requests')
  })

  await test("user A's exhaustion does not affect user B's quota", async () => {
    const [c] = await sql('select request_count from public.ai_usage where user_id=$1 and period_start=$2', [A.id, P1])
    eq(c.request_count, 10, 'A at limit')
    const r = await reserve(B.id, P0, P0E, 10)
    ok(r[0].allowed, 'B in separate period allowed')
    const [b1] = await sql('select request_count from public.ai_usage where user_id=$1 and period_start=$2', [B.id, P1])
    eq(b1.request_count, 5, 'B period1 untouched')
  })

  await test('concurrent commit x20 + release x20 on the same reservation: single terminal state, no double effect', async () => {
    const U = await makeUser('race1')
    const ids = []
    for (let i = 0; i < 12; i++) ids.push((await reserve(U.id, P1, P1E, 100))[0].reservation_id)
    await Promise.all(ids.flatMap((id) => [
      ...Array.from({ length: 10 }, () => svc('select public.commit_ai_usage_reservation($1) c', [id])),
      ...Array.from({ length: 10 }, () => svc('select public.release_ai_usage_reservation($1) r', [id])),
    ]))
    const rows = await sql('select status from public.ai_usage_reservations where user_id=$1', [U.id])
    ok(rows.every((r) => ['committed', 'released'].includes(r.status)), 'non-terminal state remains')
    await invariant(U.id, P1, 'after commit/release race')
    const [u] = await sql('select request_count from public.ai_usage where user_id=$1 and period_start=$2', [U.id, P1])
    ok(u.request_count >= 0 && u.request_count <= 12, 'count out of range')
  })

  await test('duplicate / cross terminal operations are idempotent and never flip state', async () => {
    const U = await makeUser('dup')
    const a = (await reserve(U.id, P1, P1E, 10))[0].reservation_id
    eq((await svc('select public.commit_ai_usage_reservation($1) v', [a]))[0].v, true, 'commit')
    eq((await svc('select public.commit_ai_usage_reservation($1) v', [a]))[0].v, true, 'commit again')
    eq((await svc('select public.release_ai_usage_reservation($1) v', [a]))[0].v, false, 'release after commit')
    const b = (await reserve(U.id, P1, P1E, 10))[0].reservation_id
    eq((await svc('select public.release_ai_usage_reservation($1) v', [b]))[0].v, true, 'release')
    eq((await svc('select public.release_ai_usage_reservation($1) v', [b]))[0].v, true, 'release again')
    eq((await svc('select public.commit_ai_usage_reservation($1) v', [b]))[0].v, false, 'commit after release')
    await invariant(U.id, P1, 'dup ops')
    eq((await sql('select request_count from public.ai_usage where user_id=$1 and period_start=$2', [U.id, P1]))[0].request_count, 1, 'net count')
  })

  await test('cleanup preserves active + committed, releases only expired reserved (floor/boundary)', async () => {
    const U = await makeUser('clean')
    const ids = []
    for (let i = 0; i < 6; i++) ids.push((await reserve(U.id, P1, P1E, 50))[0].reservation_id)
    await sql(`update public.ai_usage_reservations set created_at = now() - interval '1 hour' where reservation_id = any($1)`, [ids.slice(0, 3)]) // expired
    await sql(`update public.ai_usage_reservations set created_at = now() - interval '10 minutes' where reservation_id = $1`, [ids[3]]) // active (below 15m)
    await svc('select public.commit_ai_usage_reservation($1)', [ids[4]])
    await sql(`update public.ai_usage_reservations set created_at = now() - interval '2 hours' where reservation_id = $1`, [ids[4]]) // old but committed
    eq((await svc(`select public.release_expired_ai_usage_reservations(interval '15 minutes', 500) n`))[0].n, 3, 'released')
    const st = Object.fromEntries((await sql('select reservation_id, status from public.ai_usage_reservations where user_id=$1', [U.id])).map((r) => [r.reservation_id, r.status]))
    eq(st[ids[3]], 'reserved', 'active kept'); eq(st[ids[4]], 'committed', 'committed kept'); eq(st[ids[5]], 'reserved', 'fresh kept')
    eq((await svc(`select public.release_expired_ai_usage_reservations(interval '15 minutes', 500) n`))[0].n, 0, 'repeat is harmless')
    await invariant(U.id, P1, 'after cleanup')
    let err = ''; try { await svc(`select public.release_expired_ai_usage_reservations(interval '4 minutes', 10)`) } catch (e) { err = e.message }
    ok(/at least 5 minutes/.test(err), 'floor not enforced')
    err = ''; try { await svc(`select public.release_expired_ai_usage_reservations(interval '15 minutes', 0)`) } catch (e) { err = e.message }
    ok(/Invalid batch size/.test(err), 'batch bound not enforced')
  })

  await test('concurrent cleanup x8 releases each expired reservation exactly once', async () => {
    const U = await makeUser('cc')
    const ids = []
    for (let i = 0; i < 40; i++) ids.push((await reserve(U.id, P1, P1E, 100))[0].reservation_id)
    await sql(`update public.ai_usage_reservations set created_at = now() - interval '1 hour' where user_id=$1`, [U.id])
    const n = await Promise.all(Array.from({ length: 8 }, () => svc(`select public.release_expired_ai_usage_reservations(interval '15 minutes', 500) n`)))
    eq(n.reduce((s, r) => s + r[0].n, 0), 40, 'total released across runners')
    eq((await sql('select request_count from public.ai_usage where user_id=$1 and period_start=$2', [U.id, P1]))[0].request_count, 0, 'count back to 0')
    await invariant(U.id, P1, 'concurrent cleanup')
  })

  await test('cleanup racing with commit and release on the same expired rows keeps accounting exact', async () => {
    const U = await makeUser('crace')
    const ids = []
    for (let i = 0; i < 40; i++) ids.push((await reserve(U.id, P1, P1E, 100))[0].reservation_id)
    await sql(`update public.ai_usage_reservations set created_at = now() - interval '1 hour' where user_id=$1`, [U.id])
    await Promise.all([
      ...Array.from({ length: 4 }, () => svc(`select public.release_expired_ai_usage_reservations(interval '15 minutes', 500)`)),
      ...ids.slice(0, 15).map((id) => svc('select public.commit_ai_usage_reservation($1)', [id])),
      ...ids.slice(15, 30).map((id) => svc('select public.release_ai_usage_reservation($1)', [id])),
    ])
    const rows = await sql('select status, count(*)::int n from public.ai_usage_reservations where user_id=$1 group by status', [U.id])
    eq(rows.reduce((s, r) => s + r.n, 0), 40, 'rows lost or duplicated')
    await invariant(U.id, P1, 'cleanup/commit/release race')
    const [u] = await sql('select request_count from public.ai_usage where user_id=$1 and period_start=$2', [U.id, P1])
    ok(u.request_count >= 0, 'negative count')
  })

  await test('request_count never underflows when usage row is already 0', async () => {
    const U = await makeUser('uf')
    const id = (await reserve(U.id, P1, P1E, 10))[0].reservation_id
    await sql('update public.ai_usage set request_count = 0 where user_id=$1 and period_start=$2', [U.id, P1])
    eq((await svc('select public.release_ai_usage_reservation($1) v', [id]))[0].v, true, 'release')
    eq((await sql('select request_count from public.ai_usage where user_id=$1 and period_start=$2', [U.id, P1]))[0].request_count, 0, 'stays 0')
  })

  await test('monthly boundaries: periods have independent counters; releases never cross periods', async () => {
    const U = await makeUser('per')
    const old = (await reserve(U.id, P0, P0E, 2))[0]
    await reserve(U.id, P0, P0E, 2); ok(!(await reserve(U.id, P0, P0E, 2))[0].allowed, 'old period capped at 2')
    ok((await reserve(U.id, P1, P1E, 2))[0].allowed, 'new period opens fresh')
    await svc('select public.release_ai_usage_reservation($1)', [old.reservation_id])
    eq((await sql('select request_count from public.ai_usage where user_id=$1 and period_start=$2', [U.id, P1]))[0].request_count, 1, 'new period unaffected')
    eq((await sql('select request_count from public.ai_usage where user_id=$1 and period_start=$2', [U.id, P0]))[0].request_count, 1, 'old period decremented')
  })

  await test('limit 0 / null limit / invalid args behave and leave no state', async () => {
    const U = await makeUser('lim')
    ok(!(await reserve(U.id, P1, P1E, 0))[0].allowed, 'limit 0 denied')
    eq((await sql('select count(*)::int n from public.ai_usage_reservations where user_id=$1', [U.id]))[0].n, 0, 'no reservation row')
    for (let i = 0; i < 3; i++) ok((await reserve(U.id, P1, P1E, null))[0].allowed, 'unlimited allowed')
    for (const args of [[U.id, P1, P1E, -1], [U.id, P1E, P1, 5], [null, P1, P1E, 5]]) {
      let threw = false; try { await reserve(...args) } catch { threw = true }
      ok(threw, 'invalid args accepted')
    }
    await invariant(U.id, P1, 'invalid args')
  })

  await test('rolled-back transaction leaves no usage and no reservation (DB failure cannot grant/burn quota)', async () => {
    const U = await makeUser('rb')
    const c = await pool.connect()
    try {
      await c.query('begin'); await c.query(`select set_config('request.jwt.claims','{"role":"service_role"}',true)`)
      await c.query('select * from public.reserve_ai_usage($1,$2,$3,10)', [U.id, P1, P1E])
      await c.query('rollback')
    } finally { c.release() }
    eq((await sql('select count(*)::int n from public.ai_usage where user_id=$1', [U.id]))[0].n, 0, 'usage rows')
    eq((await sql('select count(*)::int n from public.ai_usage_reservations where user_id=$1', [U.id]))[0].n, 0, 'reservation rows')
  })

  await test('PostgREST: anon and authenticated JWTs cannot execute any privileged RPC; service role can', async () => {
    const calls = {
      reserve_ai_usage: { p_user_id: A.id, p_period_start: P1, p_period_end: P1E, p_request_limit: 99 },
      commit_ai_usage_reservation: { p_reservation_id: randomUUID() },
      release_ai_usage_reservation: { p_reservation_id: randomUUID() },
      release_expired_ai_usage_reservations: { p_older_than: '15 minutes', p_limit: 10 },
      consume_ai_usage: { p_user_id: A.id, p_period_start: P1, p_period_end: P1E, p_request_limit: 99 },
      release_ai_usage: { p_user_id: A.id, p_period_start: P1 },
    }
    for (const [fn, body] of Object.entries(calls)) {
      const anon = await rpc(fn, body, ANON_KEY)
      const user = await rpc(fn, body, ANON_KEY, A.jwt)
      ok(anon.status >= 400 && anon.status < 500, `${fn} anon status ${anon.status}`)
      ok(user.status >= 400 && user.status < 500, `${fn} authenticated status ${user.status}`)
    }
    const before = (await sql('select request_count from public.ai_usage where user_id=$1 and period_start=$2', [A.id, P1]))[0].request_count
    eq(before, 10, 'unauthorized calls changed usage')
    const s = await rpc('release_expired_ai_usage_reservations', calls.release_expired_ai_usage_reservations, SERVICE_ROLE_KEY)
    eq(s.status, 200, 'service role cleanup status')
    for (const fn of ['consume_ai_usage', 'release_ai_usage']) ok((await rpc(fn, calls[fn], SERVICE_ROLE_KEY)).status >= 400, `${fn} legacy helper still callable by service role`)
  })

  await test('legacy record_ai_usage is not callable by users; service-role call without auth.uid cannot change quota', async () => {
    const before = await sql(
      'select request_count, input_tokens, output_tokens, estimated_cost from public.ai_usage where user_id=$1 and period_start=$2',
      [A.id, P1],
    )
    const args = { p_period_start: P1, p_period_end: P1E, p_input_tokens: 7, p_output_tokens: 9, p_estimated_cost: 1 }
    const userCall = await rpc('record_ai_usage', args, ANON_KEY, A.jwt)
    ok(userCall.status >= 400, `authenticated user invoked legacy function: ${userCall.status}`)
    const serviceCall = await rpc('record_ai_usage', args, SERVICE_ROLE_KEY)
    ok(serviceCall.status >= 400, `service role without a user subject invoked legacy function: ${serviceCall.status}`)
    const after = await sql(
      'select request_count, input_tokens, output_tokens, estimated_cost from public.ai_usage where user_id=$1 and period_start=$2',
      [A.id, P1],
    )
    eq(JSON.stringify(after), JSON.stringify(before), 'legacy RPC changed quota or token accounting')
  })

  await test('PostgREST: authenticated users cannot read reservations and only see their own ai_usage (RLS)', async () => {
    const get = async (path, bearer) => { const r = await fetch(`${API_URL}/rest/v1/${path}`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${bearer}` } }); return { status: r.status, body: await r.json().catch(() => null) } }
    const res = await get('ai_usage_reservations?select=*', A.jwt)
    ok(res.status >= 400 || (Array.isArray(res.body) && res.body.length === 0), `reservations readable: ${res.status}`)
    const mine = await get('ai_usage?select=user_id', A.jwt)
    eq(mine.status, 200, 'own usage status'); ok(mine.body.length > 0 && mine.body.every((r) => r.user_id === A.id), 'sees other users usage')
    const wr = await fetch(`${API_URL}/rest/v1/ai_usage?user_id=eq.${A.id}`, { method: 'PATCH', headers: { apikey: ANON_KEY, Authorization: `Bearer ${A.jwt}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ request_count: 0 }) })
    const wb = await wr.json().catch(() => null)
    ok(wr.status >= 400 || (Array.isArray(wb) && wb.length === 0), 'authenticated user can modify own quota')
    eq((await sql('select request_count from public.ai_usage where user_id=$1 and period_start=$2', [A.id, P1]))[0].request_count, 10, 'quota tampered')
  })

  await test('direct DB sessions: anon/authenticated roles denied; claims-less superuser call denied', async () => {
    for (const role of ['anon', 'authenticated']) {
      let err = ''; try { await asRole(role, `select * from public.reserve_ai_usage($1,$2,$3,5)`, [A.id, P1, P1E]) } catch (e) { err = e.message }
      ok(/permission denied/.test(err), `${role}: ${err || 'allowed'}`)
      err = ''; try { await asRole(role, `select * from public.reserve_ai_usage_idempotent($1,$2,$3,5,$4)`, [A.id, P1, P1E, randomUUID()]) } catch (e) { err = e.message }
      ok(/permission denied/.test(err), `${role} idempotent RPC: ${err || 'allowed'}`)
    }
    let err = ''; try { await sql(`select * from public.reserve_ai_usage($1,$2,$3,5)`, [A.id, P1, P1E]) } catch (e) { err = e.message }
    ok(/Service role required/.test(err), `no-claim call: ${err || 'allowed'}`)
    err = ''; try { await sql(`select * from public.reserve_ai_usage_idempotent($1,$2,$3,5,$4)`, [A.id, P1, P1E, randomUUID()]) } catch (e) { err = e.message }
    ok(/Service role required/.test(err), `idempotent RPC no-claim call: ${err || 'allowed'}`)
  })
} catch (e) {
  failed++; results.push(`FAIL setup: ${e.message}`)
} finally {
  // Remove only the disposable users created by this run (profiles/usage/reservations cascade).
  for (const id of created) {
    await fetch(`${API_URL}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }).catch(() => {})
  }
  await pool.end()
}
console.log(results.join('\n'))
console.log(`\n${passed}/${passed + failed} local-Supabase integration tests passed (real Postgres, separate connections, GoTrue JWTs, PostgREST)`)
process.exit(failed ? 1 : 0)
