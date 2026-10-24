// Route-level tests for every AI route. External providers are mocked (global fetch);
// no network calls or real credits are used. Supabase clients are in-memory fakes, so
// these tests verify route + helper behavior, NOT database behavior.
declare const require: (id: string) => any

const FAKE_KEY = 'sk-test-secret-key-do-not-leak'
const PROVIDER_ERROR_TEXT = 'internal-provider-detail-xyz'
const USER = { id: 'user-a' }
let testRequestSequence = 0
const nextIdempotencyKey = () => `00000000-0000-4000-8000-${String(++testRequestSequence).padStart(12, '0')}`

type Sub = Record<string, unknown> | null
interface Harness {
  fetchCalls: number
  reserveCalls: string[]
  cleanupCalls: Array<Record<string, any>>
  state: { used: number; committed: number; released: number }
  admin: any
}

function permissiveChain(subscription: Sub): any {
  const result = { data: null, error: null }
  const handler: ProxyHandler<any> = {
    get(_t, prop) {
      if (prop === 'then') return (resolve: any) => resolve(result)
      if (prop === 'maybeSingle' || prop === 'single') return async () => ({ data: subscription, error: null })
      return () => new Proxy(function () { /* chain */ }, handler)
    },
    apply: () => new Proxy(function () { /* chain */ }, handler),
  }
  return new Proxy(function () { /* chain */ }, handler)
}

function install(options: { user?: any; subscription?: Sub; limit?: number; failReserve?: boolean; failCommit?: boolean; missingAdmin?: boolean }): Harness {
  require('../../lib/billing/abuse-guard').aiAbuseGuard.reset()
  const h: Harness = { fetchCalls: 0, reserveCalls: [], cleanupCalls: [], state: { used: 0, committed: 0, released: 0 }, admin: null }
  const finalized = new Set<string>()
  const reservationsByKey = new Map<string, string>()
  let seq = 0
  const limit = options.limit ?? 10
  h.admin = {
    rpc: async (name: string, args: Record<string, any>) => {
      if (name === 'reserve_ai_usage_idempotent') {
        if (options.failReserve) return { data: null, error: { message: 'db down' } }
        const key = `${args.p_user_id}:${args.p_idempotency_key}`
        const existingId = reservationsByKey.get(key)
        if (existingId) {
          return { data: [{ reservation_id: existingId, allowed: false, request_count: h.state.used, duplicate: true }], error: null }
        }
        h.reserveCalls.push(args.p_user_id)
        if (h.state.used >= limit) return { data: [{ reservation_id: null, allowed: false, request_count: h.state.used, duplicate: false }], error: null }
        h.state.used += 1; seq += 1
        const reservationId = `r${seq}`
        reservationsByKey.set(key, reservationId)
        return { data: [{ reservation_id: reservationId, allowed: true, request_count: h.state.used, duplicate: false }], error: null }
      }
      if (name === 'release_expired_ai_usage_reservations') { h.cleanupCalls.push(args); return { data: 3, error: null } }
      if (name === 'commit_ai_usage_reservation' && options.failCommit) {
        return { data: null, error: { message: 'db down' } }
      }
      if (finalized.has(args.p_reservation_id)) return { data: false, error: null }
      finalized.add(args.p_reservation_id)
      if (name === 'commit_ai_usage_reservation') h.state.committed += 1
      else { h.state.released += 1; h.state.used -= 1 }
      return { data: true, error: null }
    },
  }
  const user = options.user === undefined ? USER : options.user
  const chain = permissiveChain(options.subscription ?? null)
  ;(globalThis as any).__kayvenTestServerClient = {
    auth: { getUser: async () => ({ data: { user }, error: user ? null : { message: 'no session' } }) },
    from: () => chain,
  }
  ;(globalThis as any).__kayvenTestAdminClient = options.missingAdmin ? null : h.admin
  return h
}

type ProviderMode = 'ok' | 'http_error' | 'throw' | 'empty' | 'malformed' | 'wrong_shape'
function mockProvider(h: Harness, mode: ProviderMode, okText: string) {
  ;(globalThis as any).fetch = async (url: string, init: any) => {
    h.fetchCalls += 1
    if (!String(url).startsWith('https://api.anthropic.com/')) throw new Error(`unexpected network call: ${url}`)
    if (mode === 'throw') throw new Error(`timeout ${PROVIDER_ERROR_TEXT} ${FAKE_KEY}`)
    if (mode === 'http_error') return { ok: false, status: 500, json: async () => ({ error: PROVIDER_ERROR_TEXT, key: FAKE_KEY }) }
    const text = mode === 'ok' ? okText : mode === 'empty' ? '' : mode === 'wrong_shape' ? '{}' : 'not json at all'
    void init
    return { ok: true, status: 200, json: async () => ({ content: [{ text }] }) }
  }
}

function plan() {
  const option = (n: string) => ({ name: n, ingredients: [{ name: 'x', quantity: '1' }], nutrition: { calories: 1, protein: 1, carbs: 1, fat: 1, fiber: 1 }, recipe: ['a'], tip: '' })
  return JSON.stringify({ meals: ['Breakfast', 'Lunch', 'Snack', 'Dinner'].map(type => ({ type, options: ['a', 'b', 'c', 'd'].map(o => option(`${type}-${o}`)) })) })
}

const STANDARD = { plan_id: 'standard', status: 'active', current_period_end: '2999-01-01T00:00:00Z' }

interface RouteSpec {
  name: string
  path: string
  feature: 'ai_coach' | 'advanced_progress'
  validBody: any
  invalidBody: any
  oversizedBody: any
  okText: string
  subscription: Sub
}
const ROUTES: RouteSpec[] = [
  { name: 'suggestions', path: 'app/api/suggestions/route.js', feature: 'ai_coach', validBody: { totals: { cal: 1 }, targets: { cal: 1 }, logs: [] }, invalidBody: { totals: 'x' }, oversizedBody: { totals: { cal: 1 }, targets: { cal: 1 }, logs: new Array(201).fill({}) }, okText: '{"tip":"Good start","status":"on_track","suggestions":[{"name":"Eggs","reason":"Protein-rich","cal":78,"protein":6}]}', subscription: null },
  { name: 'ai-scan', path: 'app/api/ai-scan/route.js', feature: 'ai_coach', validBody: { image: 'abcd', mimeType: 'image/png' }, invalidBody: { image: 'abcd', mimeType: 'application/pdf' }, oversizedBody: { image: 'a'.repeat(8 * 1024 * 1024 + 1), mimeType: 'image/png' }, okText: '{"name":"Rice","cal":200,"qty":100}', subscription: null },
  { name: 'meal-plan', path: 'app/api/meal-plan/route.js', feature: 'ai_coach', validBody: { targets: { cal: 1, protein: 1, carb: 1, fat: 1 }, profile: {} }, invalidBody: { profile: {} }, oversizedBody: { targets: { cal: 1 }, customPrompt: 'x'.repeat(4001) }, okText: plan(), subscription: null },
  { name: 'insights', path: 'app/api/insights/route.js', feature: 'advanced_progress', validBody: { weeklyLogs: [{ date: 'd', cal: 1, protein: 1, carb: 1, fat: 1 }], targets: { cal: 1, protein: 1, carb: 1, fat: 1 } }, invalidBody: { weeklyLogs: 'nope' }, oversizedBody: { weeklyLogs: new Array(32).fill({}), targets: { cal: 1 } }, okText: '{"headline":"ok","score":70,"calories_avg":1,"protein_avg":1,"insights":[],"best_day":"Mon","consistency":70}', subscription: STANDARD },
]

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message)
}

async function call(outputRoot: string, spec: { path: string }, body: unknown, idempotencyKey: string | null = nextIdempotencyKey()): Promise<{ status: number; text: string }> {
  const { NextRequest } = require('next/server')
  const route = require(`${outputRoot}/${spec.path}`)
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
  const req = new NextRequest('http://localhost/api/test', { method: 'POST', headers, body: JSON.stringify(body) })
  const res = await route.POST(req)
  return { status: res.status, text: await res.text() }
}

export async function runAIRouteTests(outputRoot: string): Promise<void> {
  const g = globalThis as any
  const { meteredAIFailureResponse } = require('../../lib/server/ai-quota-response')
  const originalFetch = g.fetch
  const originalError = console.error
  const originalWarn = console.warn
  const originalLog = console.log
  const previousEnv = { key: process.env.ANTHROPIC_API_KEY, url: process.env.NEXT_PUBLIC_SUPABASE_URL, role: process.env.SUPABASE_SERVICE_ROLE_KEY, dev: process.env.KAYVEN_DEV_PLAN }
  process.env.ANTHROPIC_API_KEY = FAKE_KEY
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:0'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role'
  delete process.env.KAYVEN_DEV_PLAN
  if (!process.env.KAYVEN_TEST_VERBOSE) { console.error = () => undefined; console.warn = () => undefined; console.log = () => undefined }

  const noLeak = (name: string, r: { text: string }) => {
    assert(!r.text.includes(FAKE_KEY) && !r.text.includes(PROVIDER_ERROR_TEXT) && !r.text.includes('db down'), `${name}: response leaked a secret or internal error`)
  }

  try {
    const throttled = meteredAIFailureResponse({ status: 'throttled', reason: 'cooldown', retryAfterSeconds: 17 })
    assert(throttled.status === 429 && throttled.headers.get('Retry-After') === '17', 'throttling must return 429 with Retry-After')

    for (const spec of ROUTES) {
      const n = spec.name
      let h: Harness, r: { status: number; text: string }

      // unauthenticated → 401, nothing reserved or fetched
      h = install({ user: null, subscription: spec.subscription }); mockProvider(h, 'ok', spec.okText)
      r = await call(outputRoot, spec, spec.validBody)
      assert(r.status === 401 && h.fetchCalls === 0 && h.reserveCalls.length === 0, `${n}: unauthenticated must return 401 without reserving or calling the provider`)

      // invalid input → 400 before reserving or provider
      h = install({ subscription: spec.subscription }); mockProvider(h, 'ok', spec.okText)
      r = await call(outputRoot, spec, spec.invalidBody)
      assert(r.status === 400 && h.fetchCalls === 0 && h.reserveCalls.length === 0, `${n}: invalid input must be rejected before reserve/provider (got ${r.status})`)

      // Missing idempotency key is rejected before quota reservation or provider work.
      h = install({ subscription: spec.subscription }); mockProvider(h, 'ok', spec.okText)
      r = await call(outputRoot, spec, spec.validBody, null)
      assert(r.status === 400 && h.fetchCalls === 0 && h.reserveCalls.length === 0, `${n}: missing idempotency key must be rejected`)

      // oversized input → 400 before reserving or provider
      h = install({ subscription: spec.subscription }); mockProvider(h, 'ok', spec.okText)
      r = await call(outputRoot, spec, spec.oversizedBody)
      assert(r.status === 400 && h.fetchCalls === 0 && h.reserveCalls.length === 0, `${n}: oversized input must be rejected before reserve/provider (got ${r.status})`)

      // missing provider key → 503 before reserving
      delete process.env.ANTHROPIC_API_KEY
      h = install({ subscription: spec.subscription }); mockProvider(h, 'ok', spec.okText)
      r = await call(outputRoot, spec, spec.validBody)
      process.env.ANTHROPIC_API_KEY = FAKE_KEY
      assert(r.status === 503 && h.fetchCalls === 0 && h.reserveCalls.length === 0, `${n}: missing provider key must not reserve`)

      // success commits exactly once
      h = install({ subscription: spec.subscription }); mockProvider(h, 'ok', spec.okText)
      const logicalRequestKey = nextIdempotencyKey()
      r = await call(outputRoot, spec, spec.validBody, logicalRequestKey)
      assert(r.status === 200 && h.fetchCalls === 1, `${n}: success path failed (${r.status} ${r.text.slice(0, 120)})`)
      assert(h.state.committed === 1 && h.state.released === 0 && h.state.used === 1 && h.reserveCalls[0] === USER.id, `${n}: success must commit exactly once for the caller`)
      noLeak(n, r)
      const duplicate = await call(outputRoot, spec, spec.validBody, logicalRequestKey)
      assert(duplicate.status === 409 && h.fetchCalls === 1 && h.state.committed === 1 && h.state.used === 1,
        `${n}: repeating the same idempotency key must not call the provider or charge twice`)
      noLeak(`${n}/duplicate`, duplicate)

      // A successful provider response is not reported as success if usage commit is unconfirmed.
      h = install({ subscription: spec.subscription, failCommit: true }); mockProvider(h, 'ok', spec.okText)
      r = await call(outputRoot, spec, spec.validBody)
      assert(r.status === 503 && h.fetchCalls === 1 && h.state.committed === 0 && h.state.released === 0,
        `${n}: unconfirmed commit must fail closed without releasing or claiming success`)
      noLeak(`${n}/commit-failed`, r)

      // provider errors / timeouts / empty / malformed → released, no leaks
      for (const mode of ['http_error', 'throw', 'empty', 'malformed', 'wrong_shape'] as ProviderMode[]) {
        h = install({ subscription: spec.subscription }); mockProvider(h, mode, spec.okText)
        r = await call(outputRoot, spec, spec.validBody)
        assert(r.status >= 400, `${n}/${mode}: failures must return an error status, got ${r.status}`)
        assert(h.state.released === 1 && h.state.committed === 0 && h.state.used === 0, `${n}/${mode}: reservation must be released and usage unchanged`)
        noLeak(`${n}/${mode}`, r)
      }

      // quota exhausted → 429 without a provider call
      h = install({ subscription: spec.subscription, limit: 0 }); mockProvider(h, 'ok', spec.okText)
      r = await call(outputRoot, spec, spec.validBody)
      assert(r.status === 429 && h.fetchCalls === 0 && JSON.parse(r.text).error === 'AI_USAGE_LIMIT_REACHED', `${n}: exhausted quota must return 429 without a provider call`)

      // repeated requests cannot exceed the limit
      h = install({ subscription: spec.subscription, limit: 2 }); mockProvider(h, 'ok', spec.okText)
      const statuses: number[] = []
      for (let i = 0; i < 5; i++) statuses.push((await call(outputRoot, spec, spec.validBody)).status)
      assert(h.fetchCalls === 2 && statuses.filter(s => s === 200).length === 2 && statuses.filter(s => s === 429).length === 3, `${n}: repeated requests must stop at the limit (${statuses.join(',')})`)

      // reservation failure and missing admin client fail closed
      for (const variant of [{ failReserve: true }, { missingAdmin: true }]) {
        h = install({ subscription: spec.subscription, ...variant }); mockProvider(h, 'ok', spec.okText)
        r = await call(outputRoot, spec, spec.validBody)
        assert(r.status === 503 && h.fetchCalls === 0, `${n}: reservation failure must fail closed`)
        noLeak(n, r)
      }
    }

    // entitlement denial (insights on the free plan) blocks reserve and provider
    const insights = ROUTES.find(x => x.name === 'insights') as RouteSpec
    let h = install({ subscription: null }); mockProvider(h, 'ok', insights.okText)
    let r = await call(outputRoot, insights, insights.validBody)
    assert(r.status === 403 && h.fetchCalls === 0 && h.reserveCalls.length === 0, 'insights: entitlement denial must block reserve and provider')

    await runCleanupRouteTests(outputRoot, noLeak)
    await runCoachTests(outputRoot, noLeak)
  } finally {
    g.fetch = originalFetch
    console.error = originalError
    console.warn = originalWarn
    console.log = originalLog
    for (const [k, v] of [['ANTHROPIC_API_KEY', previousEnv.key], ['NEXT_PUBLIC_SUPABASE_URL', previousEnv.url], ['SUPABASE_SERVICE_ROLE_KEY', previousEnv.role], ['KAYVEN_DEV_PLAN', previousEnv.dev]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v
    }
    delete g.__kayvenTestServerClient
    delete g.__kayvenTestAdminClient
  }
}

async function runCoachTests(outputRoot: string, noLeak: (name: string, r: { text: string }) => void): Promise<void> {
  // Heavy collaborators are replaced; the real route, billing helper and quota logic run.
  const contextModule = require(`${outputRoot}/lib/server/kayven-intelligence-context`)
  const engineModule = require(`${outputRoot}/lib/server/kayven-intelligence-engine`)
  const aiChat = require(`${outputRoot}/lib/server/kayven-brain/ai-chat`)
  const composer = require(`${outputRoot}/lib/server/kayven-brain/response-composer`)
  const originals = { ctx: contextModule.getKayvenIntelligenceContext, det: engineModule.attemptDeterministicToolResponse, gen: aiChat.generateKayvenAIResponse, compose: composer.composeKAYVENResponse }
  contextModule.getKayvenIntelligenceContext = async () => ({})
  engineModule.attemptDeterministicToolResponse = async () => null
  composer.composeKAYVENResponse = () => ({ shouldFallback: true })

  const spec = { path: 'app/api/coach/route.js' }
  const body = { message: 'I feel hungry at night, what should I do?' }
  let generated = 0
  let mode: 'ok' | 'null' | 'throw' | 'unused' = 'ok'
  aiChat.generateKayvenAIResponse = async () => {
    generated += 1
    if (mode === 'throw') throw new Error(`provider timeout ${PROVIDER_ERROR_TEXT} ${FAKE_KEY}`)
    if (mode === 'null') return null
    return { message: 'ok', provider: { name: 'test' }, metadata: { usedAI: mode !== 'unused' } }
  }
  const reset = () => { generated = 0 }

  try {
    let h = install({ user: null }); reset()
    let r = await call(outputRoot, spec, body)
    assert(r.status === 401 && generated === 0 && h.reserveCalls.length === 0, 'coach: unauthenticated must return 401 without reserving')

    h = install({}); reset()
    r = await call(outputRoot, spec, { message: '' })
    assert(r.status === 400 && generated === 0 && h.reserveCalls.length === 0, 'coach: invalid input must be rejected before reserving')

    h = install({}); reset(); mode = 'ok'
    r = await call(outputRoot, spec, body)
    assert(r.status === 200 && generated === 1, `coach: AI path was not reached (${r.status} ${r.text.slice(0, 200)})`)
    assert(h.state.committed === 1 && h.state.released === 0 && h.state.used === 1, 'coach: success must commit exactly once')

    h = install({}); reset(); mode = 'null'
    await call(outputRoot, spec, body)
    assert(generated === 1 && h.state.released === 1 && h.state.used === 0 && h.state.committed === 0, 'coach: empty AI result must release')

    h = install({}); reset(); mode = 'unused'
    await call(outputRoot, spec, body)
    assert(h.state.released === 1 && h.state.used === 0, 'coach: a response that did not use AI must release')

    h = install({}); reset(); mode = 'throw'
    r = await call(outputRoot, spec, body)
    assert(h.state.released === 1 && h.state.used === 0 && h.state.committed === 0, 'coach: provider exception must release')
    noLeak('coach/throw', r)

    h = install({ limit: 0 }); reset(); mode = 'ok'
    r = await call(outputRoot, spec, body)
    assert(r.status === 429 && generated === 0, 'coach: exhausted quota must block the provider')

    h = install({ failReserve: true }); reset()
    r = await call(outputRoot, spec, body)
    assert(r.status === 503 && generated === 0, 'coach: reservation failure must fail closed')
    noLeak('coach/reserve', r)

    h = install({ limit: 2 }); reset(); mode = 'ok'
    const statuses: number[] = []
    for (let i = 0; i < 4; i++) statuses.push((await call(outputRoot, spec, body)).status)
    assert(generated === 2 && statuses.filter(s => s === 429).length === 2, `coach: repeated requests must stop at the limit (${statuses.join(',')})`)
  } finally {
    contextModule.getKayvenIntelligenceContext = originals.ctx
    engineModule.attemptDeterministicToolResponse = originals.det
    aiChat.generateKayvenAIResponse = originals.gen
    composer.composeKAYVENResponse = originals.compose
  }
}

async function runCleanupRouteTests(outputRoot: string, noLeak: (name: string, r: { text: string }) => void): Promise<void> {
  const { NextRequest } = require('next/server')
  const route = require(`${outputRoot}/app/api/internal/ai-reservations/cleanup/route.js`)
  const secret = 'cleanup-secret-0123456789'
  const saved = { a: process.env.AI_CLEANUP_SECRET, c: process.env.CRON_SECRET, m: process.env.AI_RESERVATION_EXPIRY_MINUTES }
  const run = async (method: 'GET' | 'POST', authorization?: string) => {
    const res = await route[method](new NextRequest('http://localhost/api/internal/ai-reservations/cleanup', { method, headers: authorization ? { authorization } : {} }))
    return { status: res.status, text: await res.text() }
  }
  try {
    delete process.env.CRON_SECRET; delete process.env.AI_RESERVATION_EXPIRY_MINUTES
    process.env.AI_CLEANUP_SECRET = secret
    let h = install({}); let r = await run('POST')
    assert(r.status === 401 && h.cleanupCalls.length === 0, 'cleanup: missing credentials must be rejected')
    for (const bad of ['Bearer wrong-secret-0123456789', `Bearer ${secret}x`, secret, 'Bearer ']) {
      r = await run('POST', bad)
      assert(r.status === 401 && h.cleanupCalls.length === 0, 'cleanup: wrong credentials must be rejected')
    }
    const session = install({ user: USER })
    r = await run('GET')
    assert(r.status === 401 && session.cleanupCalls.length === 0, 'cleanup: a signed-in user without the secret must be rejected')

    h = install({}); r = await run('POST', `Bearer ${secret}`)
    assert(r.status === 200 && JSON.parse(r.text).released === 3 && h.cleanupCalls.length === 1, 'cleanup: authorized POST must run once')
    assert(h.cleanupCalls[0].p_older_than === '15 minutes', 'cleanup: default threshold must be 15 minutes')
    noLeak('cleanup', r); assert(!r.text.includes(secret), 'cleanup: secret must never be returned')

    h = install({}); r = await run('GET', `Bearer ${secret}`)
    assert(r.status === 200 && h.cleanupCalls.length === 1, 'cleanup: authorized GET (cron) must run')

    delete process.env.AI_CLEANUP_SECRET; process.env.CRON_SECRET = 'vercel-cron-secret-0123456789'
    h = install({}); r = await run('GET', 'Bearer vercel-cron-secret-0123456789')
    assert(r.status === 200 && h.cleanupCalls.length === 1, 'cleanup: CRON_SECRET must be accepted')
    process.env.CRON_SECRET = 'short'
    h = install({}); r = await run('GET', 'Bearer short')
    assert(r.status === 401 && h.cleanupCalls.length === 0, 'cleanup: weak secrets must be refused')

    process.env.AI_CLEANUP_SECRET = secret; delete process.env.CRON_SECRET
    process.env.AI_RESERVATION_EXPIRY_MINUTES = '1'
    h = install({}); r = await run('POST', `Bearer ${secret}`)
    assert(r.status === 500 && h.cleanupCalls.length === 0, 'cleanup: thresholds below the safety floor must not reach the database')
    process.env.AI_RESERVATION_EXPIRY_MINUTES = '30'
    h = install({}); await run('POST', `Bearer ${secret}`)
    assert(h.cleanupCalls[0]?.p_older_than === '30 minutes', 'cleanup: configured threshold must be passed through')

    h = install({ missingAdmin: true }); r = await run('POST', `Bearer ${secret}`)
    assert(r.status === 500, 'cleanup: missing admin client must fail')
  } finally {
    for (const [k, v] of [['AI_CLEANUP_SECRET', saved.a], ['CRON_SECRET', saved.c], ['AI_RESERVATION_EXPIRY_MINUTES', saved.m]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v
    }
  }
}
