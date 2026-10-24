// Runs real AI route handlers and runMeteredAI against a disposable local Supabase stack.
// Provider requests are intercepted. The script refuses non-local Supabase targets.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Module from 'node:module'
import { createRequire } from 'node:module'
import { randomBytes, randomUUID } from 'node:crypto'
import ts from 'typescript'
import pg from 'pg'

const require = createRequire(import.meta.url)
const workdir = process.env.KAYVEN_SUPABASE_WORKDIR || '/tmp/kayven-supabase-local'
const localEnv = Object.fromEntries(
  execFileSync('supabase', ['status', '-o', 'env'], { cwd: workdir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split('\n').map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]),
)
const isLocal = (value) => ['127.0.0.1', 'localhost'].includes(new URL(value).hostname)
if (!localEnv.DB_URL || !localEnv.API_URL || !isLocal(localEnv.DB_URL) || !isLocal(localEnv.API_URL)) {
  console.error('Refusing to run: target is not a local Supabase stack.')
  process.exit(2)
}

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY } = localEnv
const pool = new pg.Pool({ connectionString: localEnv.DB_URL, max: 20 })
const projectRoot = path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '../..')
const sourceRoot = path.join(projectRoot, 'src')
const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kayven-local-app-metering-'))
const fakeProviderKey = 'local-mocked-provider-key'
const providerErrorMarker = 'local-provider-error-must-not-leak'
const routeNames = ['coach', 'insights', 'suggestions', 'ai-scan', 'meal-plan']
const createdUsers = []
const results = []
let providerMode = 'ok'
let providerCalls = 0
let activeJwt = ''
let failed = 0
let poolClosed = false

async function closePool() {
  if (!poolClosed) {
    poolClosed = true
    await pool.end()
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function record(name, ok, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`)
  if (!ok) failed++
}

async function query(text, values = []) {
  return (await pool.query(text, values)).rows
}

async function createUser(label, planId = 'standard') {
  const email = `kayven-app-${label}-${randomBytes(4).toString('hex')}@example.test`
  const password = randomBytes(12).toString('hex')
  const created = await fetch(`${API_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  }).then((r) => r.json())
  assert(created.id, 'local Auth user creation failed')
  createdUsers.push(created.id)
  await query('insert into public.profiles (id, name) values ($1,$2) on conflict (id) do nothing', [created.id, `metering-${label}`])
  if (planId) {
    await query(
      `insert into public.subscriptions (user_id, provider, plan_id, status, current_period_start, current_period_end)
       values ($1,'local-test',$2,'active',now(),now()+interval '1 month')`,
      [created.id, planId],
    )
  }
  const token = await fetch(`${API_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json())
  assert(token.access_token, 'local Auth user sign-in failed')
  return { id: created.id, jwt: token.access_token }
}

const periodStart = () => {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

async function usageState(userId) {
  const rows = await query(
    `select u.request_count,
      count(*) filter (where r.status='committed')::int committed,
      count(*) filter (where r.status='released')::int released,
      count(*) filter (where r.status='reserved')::int reserved
     from public.ai_usage u left join public.ai_usage_reservations r
       on r.user_id=u.user_id and r.period_start=u.period_start
     where u.user_id=$1 and u.period_start=$2 group by u.request_count`,
    [userId, periodStart()],
  )
  return rows[0] || { request_count: 0, committed: 0, released: 0, reserved: 0 }
}

function validProviderText(route) {
  if (route === 'suggestions') return '{"tip":"Good start","status":"on_track","suggestions":[{"name":"Eggs","reason":"Protein-rich","cal":78,"protein":6}]}'
  if (route === 'insights') return '{"headline":"ok","score":70,"calories_avg":1,"protein_avg":1,"insights":[],"best_day":"Mon","consistency":70}'
  if (route === 'ai-scan') return '{"name":"Rice","cal":200,"qty":100}'
  if (route === 'meal-plan') {
    const option = (name) => ({ name, ingredients: [], nutrition: {}, recipe: [], tip: '' })
    return JSON.stringify({ meals: ['Breakfast', 'Lunch', 'Snack', 'Dinner'].map((type) => ({ type, options: ['a', 'b', 'c', 'd'].map((suffix) => option(`${type}-${suffix}`)) })) })
  }
  return '{"message":"mock coach reply"}'
}

function bodyFor(route) {
  if (route === 'suggestions') return { totals: { cal: 100 }, targets: { cal: 2000 }, logs: [] }
  if (route === 'insights') return { weeklyLogs: [{ date: '2026-10-18', cal: 100, protein: 10, carb: 10, fat: 5 }], targets: { cal: 2000, protein: 100, carb: 200, fat: 70 } }
  if (route === 'ai-scan') return { image: 'YQ==', mimeType: 'image/png' }
  if (route === 'meal-plan') return { targets: { cal: 2000, protein: 100, carb: 200, fat: 70 }, profile: {} }
  return { message: 'What should I eat after my workout?' }
}

async function callRoute(routeName, jwt, providerOutcome = 'ok', idempotencyKey = randomUUID()) {
  activeJwt = jwt
  providerMode = providerOutcome
  require(path.join(outputRoot, 'lib/billing/abuse-guard.js')).aiAbuseGuard.reset()
  const route = require(path.join(outputRoot, `app/api/${routeName}/route.js`))
  const { NextRequest } = require('next/server')
  const req = new NextRequest(`http://localhost/api/${routeName}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(bodyFor(routeName)),
  })
  const response = await route.POST(req)
  return { status: response.status, text: await response.text() }
}

async function main() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = API_URL
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON_KEY
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY
  process.env.ANTHROPIC_API_KEY = fakeProviderKey
  process.env.NODE_PATH = path.join(projectRoot, 'node_modules')
  Module._initPaths()

  const config = ts.readConfigFile(path.join(projectRoot, 'tsconfig.json'), ts.sys.readFile)
  assert(!config.error, 'could not read TypeScript config')
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, projectRoot)
  const files = routeNames.map((name) => path.join(sourceRoot, `app/api/${name}/route.ts`))
  const program = ts.createProgram(files, {
    ...parsed.options,
    rootDir: sourceRoot,
    outDir: outputRoot,
    noEmit: false,
    incremental: false,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    target: ts.ScriptTarget.ES2020,
  })
  const diagnostics = ts.getPreEmitDiagnostics(program)
  assert(!diagnostics.length, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getCanonicalFileName: (file) => file,
    getNewLine: () => ts.sys.newLine,
  }))
  assert(!program.emit().emitSkipped, 'route compilation was skipped')

  const originalResolve = Module._resolveFilename
  Module._resolveFilename = function (request, ...args) {
    if (request.startsWith('@/')) request = path.join(outputRoot, request.slice(2))
    return originalResolve.call(this, request, ...args)
  }
  const originalLoad = Module._load
  const originalFetch = globalThis.fetch
  const originalError = console.error
  const originalLog = console.log
  const originalInfo = console.info
  const logs = []
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url
    if (url.startsWith('https://api.anthropic.com/')) {
      providerCalls++
      if (providerMode === 'throw') throw new Error(providerErrorMarker)
      if (providerMode === 'http_error') return new Response(JSON.stringify({ error: providerErrorMarker, key: fakeProviderKey }), { status: 500 })
      const text = providerMode === 'empty' ? '' : providerMode === 'malformed' ? '{not json' : providerMode === 'wrong_shape' ? '{}' : validProviderText(activeRouteName)
      return new Response(JSON.stringify({ content: [{ text }] }), { status: 200 })
    }
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url)) {
      throw new Error(`Unexpected external fetch target ${new URL(url).origin}`)
    }
    const rpcMatch = url.match(/\/rest\/v1\/rpc\/([a-z_]+)/)
    if (rpcMatch?.[1] === rpcFaultEndpoint && rpcFault) {
      rpcFaultCalls++
      if (rpcFault === 'drop') throw new TypeError('fetch failed (injected, request not sent)')
      if (rpcFault === 'lost_response' && rpcFaultCalls <= rpcFaultLimit) {
        await originalFetch(input, init) // the database applies the change, the client never sees the reply
        throw new TypeError('fetch failed (injected, response lost)')
      }
    }
    return originalFetch(input, init)
  }
  console.error = (...args) => { logs.push(args.map((arg) => String(arg)).join(' ')) }
  console.log = () => {}
  console.info = () => {}
  let activeRouteName = ''
  let rpcFault = null
  let rpcFaultEndpoint = null
  let rpcFaultCalls = 0
  let rpcFaultLimit = 0
  Module._load = function (request, ...args) {
    if (request === 'next/headers') return { cookies: () => ({ get: () => undefined }) }
    if (request === '@supabase/ssr') {
      const { createClient } = originalLoad.call(this, '@supabase/supabase-js', ...args)
      return {
        createServerClient: (url, key) => createClient(url, key, {
          auth: { autoRefreshToken: false, persistSession: false },
          global: { headers: { Authorization: `Bearer ${activeJwt}` } },
        }),
      }
    }
    return originalLoad.call(this, request, ...args)
  }

  try {
    const A = await createUser('main')
    const B = await createUser('other')
    const coachContext = require(path.join(outputRoot, 'lib/server/kayven-intelligence-context.js'))
    const coachEngine = require(path.join(outputRoot, 'lib/server/kayven-intelligence-engine.js'))
    const coachAI = require(path.join(outputRoot, 'lib/server/kayven-brain/ai-chat.js'))
    const coachComposer = require(path.join(outputRoot, 'lib/server/kayven-brain/response-composer.js'))
    coachContext.getKayvenIntelligenceContext = async () => ({})
    coachEngine.attemptDeterministicToolResponse = async () => null
    coachComposer.composeKAYVENResponse = () => ({ shouldFallback: true })
    coachAI.shouldPreferAIResponse = () => true
    coachAI.generateKayvenAIResponse = async () => {
      providerCalls++
      if (providerMode === 'throw') throw new Error(providerErrorMarker)
      return providerMode === 'ok'
        ? { message: 'Mock response', provider: { name: 'mock' }, metadata: { usedAI: true } }
        : null
    }

    for (const name of routeNames) {
      activeRouteName = name
      const before = await usageState(A.id)
      const callsBefore = providerCalls
      const requestKey = randomUUID()
      const ok = await callRoute(name, A.jwt, 'ok', requestKey)
      const after = await usageState(A.id)
      assert(ok.status === 200, `${name} success returned ${ok.status}`)
      assert(after.request_count === before.request_count + 1, `${name} success did not increment once`)
      assert(after.committed === before.committed + 1 && after.released === before.released, `${name} success did not commit once`)
      assert(providerCalls === callsBefore + 1, `${name} success did not invoke its mocked provider`)
      assert(!ok.text.includes(fakeProviderKey), `${name} leaked provider key`)
      record(`${name}: real route + real Auth/PostgREST + real reservation, success commits once`, true)
      const duplicateCalls = providerCalls
      const duplicate = await callRoute(name, A.jwt, 'ok', requestKey)
      const afterDuplicate = await usageState(A.id)
      assert(duplicate.status === 409 && providerCalls === duplicateCalls, `${name} duplicate key invoked provider or returned ${duplicate.status}`)
      assert(afterDuplicate.request_count === after.request_count && afterDuplicate.committed === after.committed,
        `${name} duplicate key changed usage`)
      record(`${name}: repeated idempotency key returns 409 without provider execution or extra usage`, true)

      for (const mode of ['http_error', 'empty', 'malformed', 'wrong_shape', 'throw']) {
        const prev = await usageState(A.id)
        const prevCalls = providerCalls
        logs.length = 0
        const result = await callRoute(name, A.jwt, mode)
        const current = await usageState(A.id)
        assert(current.request_count === prev.request_count, `${name}/${mode} changed request_count`)
        assert(current.released === prev.released + 1 && current.committed === prev.committed, `${name}/${mode} did not release exactly once`)
        assert(providerCalls === prevCalls + 1, `${name}/${mode} did not invoke mocked provider`)
        if (name !== 'coach') assert(result.status >= 400, `${name}/${mode} returned ${result.status}`)
        assert(!result.text.includes(fakeProviderKey) && !result.text.includes(providerErrorMarker), `${name}/${mode} leaked a provider secret/error`)
        assert(!logs.join('\n').includes(fakeProviderKey) && !logs.join('\n').includes(providerErrorMarker), `${name}/${mode} logged provider secret/error`)
        if (name === 'ai-scan' && mode === 'http_error') {
          assert(logs.some((line) => line.includes('Anthropic API error: 500')), 'ai-scan did not log sanitized provider status')
          assert(logs.every((line) => !line.includes(providerErrorMarker)), 'ai-scan logged raw provider error body')
        }
        record(`${name}: ${mode} releases without consuming quota`, true)
      }
    }

    // Invalid provider credentials make the real reservation RPC fail before the provider is reached.
    activeRouteName = 'suggestions'
    const savedAdminKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    process.env.SUPABASE_SERVICE_ROLE_KEY = ANON_KEY
    const beforeFailClosed = providerCalls
    const beforeFailedUsage = await usageState(A.id)
    const failedClosed = await callRoute('suggestions', A.jwt, 'ok')
    process.env.SUPABASE_SERVICE_ROLE_KEY = savedAdminKey
    const afterFailedUsage = await usageState(A.id)
    assert(failedClosed.status === 503 && providerCalls === beforeFailClosed, 'reservation denial did not fail closed')
    assert(JSON.stringify(afterFailedUsage) === JSON.stringify(beforeFailedUsage), 'reservation denial changed quota')
    record('real RPC permission failure returns 503 before provider call', true)

    // Seed a consistent exhausted account: 10 committed reservations for a free plan.
    const Free = await createUser('free', null)
    const start = periodStart()
    const end = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toISOString()
    await query('insert into public.ai_usage(user_id,period_start,period_end,request_count) values($1,$2,$3,10)', [Free.id, start, end])
    await query(`insert into public.ai_usage_reservations(user_id,period_start,status)
      select $1,$2,'committed' from generate_series(1,10)`, [Free.id, start])
    activeRouteName = 'suggestions'
    const beforeExhausted = providerCalls
    const exhausted = await callRoute('suggestions', Free.jwt, 'ok')
    assert(exhausted.status === 429 && providerCalls === beforeExhausted, 'exhaustion did not block provider')
    record('real quota exhaustion returns 429 without provider call', true)


    // Finalization fault injection (real database, injected network faults on the finalize RPCs).
    const F = await createUser('finalize', 'standard')
    activeRouteName = 'suggestions'
    const inject = (endpoint, mode, limit = 99) => {
      rpcFaultEndpoint = endpoint
      rpcFault = mode
      rpcFaultCalls = 0
      rpcFaultLimit = limit
    }
    const R = await createUser('reserve-lost', 'standard')
    const providerCallsBeforeLostReserve = providerCalls
    inject('reserve_ai_usage_idempotent', 'lost_response', 1)
    const lostReserveResponse = await callRoute('suggestions', R.jwt, 'ok')
    const lostReserveState = await usageState(R.id)
    assert(lostReserveResponse.status === 503 && providerCalls === providerCallsBeforeLostReserve && rpcFaultCalls === 1 &&
      lostReserveState.reserved === 1 && lostReserveState.request_count === 1,
    `lost reserve response must fail closed without provider work and leave cleanup-recoverable usage ${JSON.stringify(lostReserveState)}`)
    record('real DB: reserve applied but reply lost -> 503, no provider call, row remains reserved for cleanup', true)

    inject('commit_ai_usage_reservation', 'lost_response', 1)
    let res = await callRoute('suggestions', F.jwt, 'ok')
    let st = await usageState(F.id)
    assert(res.status === 200 && st.committed === 1 && st.reserved === 0 && st.released === 0 && st.request_count === 1 && rpcFaultCalls === 2,
      `ambiguous commit was not resolved by an idempotent retry ${JSON.stringify(st)} calls=${rpcFaultCalls}`)
    record('real DB: commit applied but reply lost -> retry confirms, counted exactly once', true)

    inject('commit_ai_usage_reservation', 'drop')
    res = await callRoute('suggestions', F.jwt, 'ok')
    st = await usageState(F.id)
    assert(res.status === 503 && rpcFaultCalls === 3 && st.reserved === 1 && st.released === 0 && st.request_count === 2,
      `unconfirmed commit must return 503, stay reserved, and stop after bounded retries ${JSON.stringify(st)} calls=${rpcFaultCalls}`)
    record('real DB: unconfirmed commit returns 503, no release, bounded retries, row left reserved', true)

    inject('release_ai_usage_reservation', 'drop')
    res = await callRoute('suggestions', F.jwt, 'empty')
    st = await usageState(F.id)
    assert(rpcFaultCalls === 3 && st.reserved === 2 && st.request_count === 3, `failed release must leave reservation ${JSON.stringify(st)}`)
    record('real DB: provider failure + release unreachable -> bounded, row left reserved (over-count, no extra quota)', true)

    inject('release_ai_usage_reservation', 'lost_response', 1)
    res = await callRoute('suggestions', F.jwt, 'empty')
    st = await usageState(F.id)
    assert(st.released === 1 && st.reserved === 2 && st.request_count === 3, `lost release reply must retry idempotently ${JSON.stringify(st)}`)
    record('real DB: release applied but reply lost -> retry confirms, decremented exactly once', true)
    inject(null, null)

    // Cleanup recovers the abandoned rows; invariant request_count == reserved + committed.
    await query(`update public.ai_usage_reservations set created_at = now() - interval '1 hour' where user_id=$1 and status='reserved'`, [F.id])
    const reaped = await query(`select count(*)::int n from public.ai_usage_reservations where user_id=$1 and status='reserved' and created_at < now() - interval '15 minutes'`, [F.id])
    assert(reaped[0].n === 2, 'expected two abandoned reservations')
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)")
      const r1 = await client.query("select public.release_expired_ai_usage_reservations(interval '15 minutes', 500) n")
      await client.query('commit')
      assert(r1.rows[0].n >= 2, 'cleanup did not release abandoned rows')
    } finally { client.release() }
    st = await usageState(F.id)
    assert(st.reserved === 0 && st.request_count === st.committed, `post-cleanup accounting wrong ${JSON.stringify(st)}`)
    record('real DB: cleanup recovers unconfirmed rows and restores request_count == committed', true)

    // The other user has no usage row; the first user's usage cannot leak across user IDs.
    assert((await usageState(B.id)).request_count === 0, 'another user was charged')
    record('application metering preserves user isolation', true)
  } finally {
    console.error = originalError
    console.log = originalLog
    console.info = originalInfo
    globalThis.fetch = originalFetch
    Module._load = originalLoad
    Module._resolveFilename = originalResolve
    for (const id of createdUsers) {
      await fetch(`${API_URL}/auth/v1/admin/users/${id}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      }).catch(() => {})
    }
    await closePool()
    fs.rmSync(outputRoot, { recursive: true, force: true })
  }
}

main()
  .then(() => {
    console.log(results.join('\n'))
    console.log(`${results.length}/${results.length + failed} application-to-local-Supabase checks passed; providers mocked`)
    process.exitCode = failed ? 1 : 0
  })
  .catch(async (error) => {
    console.error(`Application-to-local-Supabase test setup failed: ${error.message}`)
    await closePool()
    fs.rmSync(outputRoot, { recursive: true, force: true })
    process.exitCode = 1
  })
